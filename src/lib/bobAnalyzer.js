/**
 * bobAnalyzer.js
 *
 * Extracts a rich, structured analytics payload from a raw Excel worksheet object.
 * This runs BEFORE deduplication | it operates on full, unmerged row data to preserve
 * all granularity needed for dashboard widgets.
 *
 * Architecture decisions enforced:
 *  - cellStyles: true must be set in XLSX.read() at the call site (UploadZone.jsx)
 *  - Cell fill colors are extracted as hex strings and grouped for the labeling modal
 *  - Column types are auto-detected via deterministic heuristics + regex
 *  - Touch/contact/cadence columns trigger a histogram widget only if detected
 *  - The sanitizeBOBForAI() export strips PII before any Gemini API call
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Columns we already handle in the existing pipeline | skip in dynamic detection */
const KNOWN_COLS = new Set([
  "merchant name", "store name", "business name",
  "store id", "sid", "business id", "business_id",
  "dm email", "decision maker", "store email", "email",
  "dm name", "contact name", "decision maker name", "first name",
  "sl opp", "sl_opp", "promo opp", "promo_opp",
  "loyal opp", "loyal_opp", "loyalty opp", "sl credit", "sl_credit",
]);

/** Regex for touch/contact/cadence columns → histogram widget */
const TOUCH_COL_REGEX = /touch|contact|cadence|reach|attempt|call|dial/i;

/** Regex for status/lead-temp text columns → status breakdown widget */
const STATUS_COL_REGEX = /status|stage|lead|temp|warm|hot|cold|result|outcome|disposition/i;

/** Regex for date columns → recency widget */
const DATE_COL_REGEX = /date|last|follow|next|scheduled|contacted/i;

/** Colors to ignore (white backgrounds, null fills) */
const IGNORE_COLORS = new Set(["FFFFFFFF", "FFFFFF", "ffffff", "ffffffff", ""]);

// ─── Helper: normalise a header string ────────────────────────────────────────
const normalizeHeader = (h) =>
  String(h ?? "").toLowerCase().replace(/_/g, " ").trim().replace(/\s+/g, " ");

// ─── Helper: is a cell value numeric? ─────────────────────────────────────────
const isNumeric = (v) => v !== null && v !== "" && !isNaN(parseFloat(v));

// ─── Helper: looks like a date string? ────────────────────────────────────────
const looksLikeDate = (v) => {
  if (!v || typeof v !== "string") return false;
  return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(v) ||
    /^\d{4}-\d{2}-\d{2}/.test(v) ||
    !isNaN(Date.parse(v));
};

// ─── Helper: coerce Excel serial date numbers ─────────────────────────────────
const excelSerialToDate = (serial) => {
  if (typeof serial !== "number" || serial < 1) return null;
  // Excel epoch is Dec 30, 1899
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
};

// ─── Helper: extract hex fill color from a SheetJS cell object ────────────────
const extractFillColor = (cellObj) => {
  if (!cellObj || !cellObj.s) return null;
  const fill = cellObj.s.fgColor || cellObj.s.bgColor;
  if (!fill) return null;

  // SheetJS returns colors as { rgb: "FFAACC" } or { theme: N, tint: 0.X }
  // We only use raw RGB fills; theme-based are unreliable to resolve
  if (fill.rgb) {
    const hex = String(fill.rgb).toUpperCase();
    if (IGNORE_COLORS.has(hex) || hex === "00000000") return null;
    // Strip leading alpha channel if 8 chars (AARRGGBB → RRGGBB)
    return hex.length === 8 ? hex.slice(2) : hex;
  }
  return null;
};

// ─── Helper: find header row index ────────────────────────────────────────────
const findHeaderRowIndex = (json) => {
  for (let i = 0; i < Math.min(json.length, 10); i++) {
    if (json[i] && json[i].filter(Boolean).length >= 3) return i;
  }
  return -1;
};

// ─── Column Type Classifier ───────────────────────────────────────────────────
/**
 * Inspects a sample of cell values from a column and returns a type classification.
 *
 * @param {string} header         - Normalised header label
 * @param {any[]} sampleValues    - Up to 30 non-null cell values from this column
 * @returns {"binary"|"status"|"touch"|"date"|"text"|"number"|"unknown"}
 */
const classifyColumn = (header, sampleValues) => {
  if (sampleValues.length === 0) return "unknown";

  const nonEmpty = sampleValues.filter(v => v !== null && v !== "" && v !== undefined);
  if (nonEmpty.length === 0) return "unknown";

  // Touch/cadence numeric columns
  if (TOUCH_COL_REGEX.test(header) && nonEmpty.every(v => isNumeric(v))) return "touch";

  // Binary 0/1 columns
  const uniqueVals = new Set(nonEmpty.map(v => String(v).trim().toLowerCase()));
  if (uniqueVals.size <= 3 && [...uniqueVals].every(v => ["0", "1", "yes", "no", "true", "false", "", "x"].includes(v))) {
    return "binary";
  }

  // Date columns
  if (DATE_COL_REGEX.test(header)) {
    const dateCount = nonEmpty.filter(v => looksLikeDate(String(v)) || (typeof v === "number" && v > 40000 && v < 60000)).length;
    if (dateCount / nonEmpty.length > 0.5) return "date";
  }

  // Status / text enum columns (small set of unique strings)
  if (STATUS_COL_REGEX.test(header) || (uniqueVals.size <= 12 && nonEmpty.every(v => typeof v === "string"))) {
    return "status";
  }

  // Pure numeric
  if (nonEmpty.every(v => isNumeric(v))) return "number";

  // Fallback
  return "text";
};

// ─── Main Export: analyzeBOB ──────────────────────────────────────────────────
/**
 * Generates a full analytics payload from an Excel worksheet.
 *
 * @param {object} ws   - SheetJS worksheet object (must be read with cellStyles: true)
 * @param {any[][]} json - sheet_to_json(ws, { header: 1 }) result (raw 2D array)
 * @returns {BobAnalyticsPayload}
 */
export const analyzeBOB = (ws, json) => {
  const headerRowIdx = findHeaderRowIndex(json);
  if (headerRowIdx === -1) return null;

  const rawHeaders = json[headerRowIdx];

  // ── Identify Store ID and Business ID column indices ─────────────────────────
  // A row without either is a blank/filler row and must be excluded from analytics,
  // matching the identical guard in bobParser.js.
  let storeIdColIdx   = -1;
  let businessIdColIdx = -1;
  rawHeaders.forEach((h, idx) => {
    if (!h) return;
    const n = normalizeHeader(h);
    if ((n.includes("store id") || n === "sid") && storeIdColIdx === -1) storeIdColIdx = idx;
    if ((n.includes("business id") || n === "business_id") && businessIdColIdx === -1) businessIdColIdx = idx;
  });

  const isValidRow = (row) => {
    if (!row || !row.some(Boolean)) return false;
    const getCell = (idx) =>
      idx !== -1 && row[idx] !== undefined && row[idx] !== null
        ? String(row[idx]).trim() : "";
    const sid = getCell(storeIdColIdx);
    const biz = getCell(businessIdColIdx);
    const sidOk = sid && sid !== "0" && sid !== "NaN" && sid !== "-";
    const bizOk = biz && biz !== "0" && biz.toLowerCase() !== "null" && biz !== "-";
    return sidOk || bizOk;
  };

  const dataRows  = json.slice(headerRowIdx + 1).filter(isValidRow);
  const totalRows = dataRows.length;

  // ── 1. Build column metadata ────────────────────────────────────────────────
  const columns = []; // { index, rawHeader, normalized, type, uniqueValues?, sampleValues }

  rawHeaders.forEach((h, colIdx) => {
    if (!h) return;
    const normalized = normalizeHeader(h);

    // Skip known pipeline columns | they already have dedicated widgets
    const isKnown = [...KNOWN_COLS].some(k => normalized.includes(k));
    if (isKnown) return;

    // Gather a sample of up to 50 non-null values from this column
    const sampleValues = dataRows
      .map(row => (row && row[colIdx] !== undefined ? row[colIdx] : null))
      .filter(v => v !== null && v !== "")
      .slice(0, 50);

    const type = classifyColumn(normalized, sampleValues);
    if (type === "unknown" || type === "text") return; // Skip pure text noise

    const uniqueValues = type === "status" || type === "binary"
      ? [...new Set(sampleValues.map(v => String(v).trim()))]
      : null;

    columns.push({
      index: colIdx,
      rawHeader: String(h),
      normalized,
      type,
      uniqueValues,
      sampleValues,
    });
  });

  // ── 2. Extract per-row data with cell colors ─────────────────────────────────
  /**
   * For each data row we store:
   *   - rowIndex: Excel row number (1-based, accounting for header)
   *   - fillColor: hex string of the row's first colored cell (null if none)
   *   - colValues: { [normalized header]: value } for all dynamic columns
   *   - knownOpps: { slOpp, promoOpp, loyalOpp, slCredit } if columns exist
   */

  // Build known opp column indices from rawHeaders
  const oppMap = { slOpp: -1, promoOpp: -1, loyalOpp: -1, slCredit: -1 };
  rawHeaders.forEach((h, idx) => {
    if (!h) return;
    const n = normalizeHeader(h);
    if (n.includes("sl opp") || n === "sl_opp") oppMap.slOpp = idx;
    if (n.includes("promo opp") || n === "promo_opp") oppMap.promoOpp = idx;
    if (n.includes("loyal opp") || n === "loyal_opp" || n.includes("loyalty opp")) oppMap.loyalOpp = idx;
    if (n.includes("sl credit") || n === "sl_credit") oppMap.slCredit = idx;
  });

  const isTruthy = (v) => {
    if (!v) return false;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || parseInt(s) > 0;
  };

  /**
   * Build the cell address string SheetJS uses: e.g. "A3" for col 0, row index 2 (0-based)
   * SheetJS rows are 1-based in cell addresses; headerRowIdx is 0-based in our json array,
   * but the actual Excel row is headerRowIdx+1 (SheetJS json already accounts for blank rows above header).
   * We compute the actual Excel row as: headerRowIdx + 1 (header) + rowOffset + 1 (1-based)
   */
  const colLetter = (idx) => {
    let letter = "";
    let n = idx;
    do {
      letter = String.fromCharCode(65 + (n % 26)) + letter;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return letter;
  };

  const rowAnalytics = dataRows.map((row, rowOffset) => {
    // Excel row number in the actual sheet
    const excelRowNum = headerRowIdx + 2 + rowOffset; // +1 for 1-based, +1 to skip header

    // Scan all cells in this row for a fill color
    let fillColor = null;
    for (let colIdx = 0; colIdx < rawHeaders.length; colIdx++) {
      const cellAddr = `${colLetter(colIdx)}${excelRowNum}`;
      const cellObj = ws[cellAddr];
      const color = extractFillColor(cellObj);
      if (color) { fillColor = color; break; }
    }

    const getVal = (idx) => {
      if (idx === -1 || !row || idx >= row.length) return null;
      const v = row[idx];
      return v !== undefined && v !== null ? String(v).trim() : null;
    };

    // Dynamic column values for this row
    const colValues = {};
    columns.forEach(col => {
      const v = row && row[col.index] !== undefined ? row[col.index] : null;
      colValues[col.normalized] = v;
    });

    return {
      fillColor,
      colValues,
      knownOpps: {
        slOpp:    isTruthy(getVal(oppMap.slOpp)),
        promoOpp: isTruthy(getVal(oppMap.promoOpp)),
        loyalOpp: isTruthy(getVal(oppMap.loyalOpp)),
        slCredit: isTruthy(getVal(oppMap.slCredit)),
      },
    };
  });

  // ── 3. Compute known opportunity stats ─────────────────────────────────────
  const oppStats = {
    slOpp:    rowAnalytics.filter(r => r.knownOpps.slOpp).length,
    promoOpp: rowAnalytics.filter(r => r.knownOpps.promoOpp).length,
    loyalOpp: rowAnalytics.filter(r => r.knownOpps.loyalOpp).length,
    slCredit: rowAnalytics.filter(r => r.knownOpps.slCredit).length,
    // Overlap: leads with BOTH slCredit AND slOpp (highest conversion probability)
    slCreditAndOpp: rowAnalytics.filter(r => r.knownOpps.slOpp && r.knownOpps.slCredit).length,
  };

  // ── 4. Compute per-column widget data ─────────────────────────────────────
  const widgets = columns.map(col => {
    const values = rowAnalytics.map(r => r.colValues[col.normalized]);

    if (col.type === "binary") {
      const trueCount = values.filter(v => isTruthy(v)).length;
      return { ...col, widget: "donut", trueCount, falseCount: totalRows - trueCount };
    }

    if (col.type === "status") {
      const distribution = {};
      values.forEach(v => {
        const key = v !== null && v !== "" ? String(v).trim() : "(blank)";
        distribution[key] = (distribution[key] || 0) + 1;
      });
      const sorted = Object.entries(distribution)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count, pct: Math.round((count / totalRows) * 100) }));
      return { ...col, widget: "statusBar", distribution: sorted };
    }

    if (col.type === "touch") {
      const nums = values.filter(v => isNumeric(v)).map(v => parseInt(v));
      const buckets = {};
      nums.forEach(n => { buckets[n] = (buckets[n] || 0) + 1; });
      const histogram = Object.entries(buckets)
        .map(([touch, count]) => ({ touch: parseInt(touch), count }))
        .sort((a, b) => a.touch - b.touch);
      const avg = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : 0;
      const max = nums.length ? Math.max(...nums) : 0;
      const untouched = values.filter(v => !isNumeric(v) || parseInt(v) === 0).length;
      return { ...col, widget: "histogram", histogram, avg, max, untouched };
    }

    if (col.type === "date") {
      const now = Date.now();
      const dates = values.map(v => {
        if (typeof v === "number") return excelSerialToDate(v);
        if (typeof v === "string" && looksLikeDate(v)) return new Date(v);
        return null;
      }).filter(Boolean);
      const ageBuckets = { stale: 0, recent: 0, thisWeek: 0, today: 0, noDate: totalRows - dates.length };
      dates.forEach(d => {
        const diffDays = (now - d.getTime()) / 86400000;
        if (diffDays < 1)        ageBuckets.today++;
        else if (diffDays < 7)   ageBuckets.thisWeek++;
        else if (diffDays < 30)  ageBuckets.recent++;
        else                     ageBuckets.stale++;
      });
      return { ...col, widget: "recency", ageBuckets, totalWithDate: dates.length };
    }

    return { ...col, widget: "generic" };
  });

  // ── 5. Extract and group cell fill colors ─────────────────────────────────
  const colorGroups = {}; // { "FF0000": { hex, count, label: null } }
  rowAnalytics.forEach(r => {
    if (!r.fillColor) return;
    if (!colorGroups[r.fillColor]) {
      colorGroups[r.fillColor] = { hex: r.fillColor, count: 0, label: null };
    }
    colorGroups[r.fillColor].count++;
  });
  const colorGroupsArray = Object.values(colorGroups).sort((a, b) => b.count - a.count);
  const uncoloredCount = rowAnalytics.filter(r => !r.fillColor).length;

  // ── 6. Assemble and return the full payload ───────────────────────────────
  return {
    totalRows,
    oppStats,
    widgets,          // Dynamic column widgets
    colorGroups: colorGroupsArray,
    uncoloredCount,
    rowAnalytics,     // Full per-row data (used by Stage 2 dynamic filters)
    dynamicColumns: columns, // Column metadata for Stage 2 filter chip generation
    hasColorData: colorGroupsArray.length > 0,
    hasTouchData: columns.some(c => c.type === "touch"),
    hasStatusData: columns.some(c => c.type === "status"),
  };
};

// ─── Sanitizer: strip PII before sending to Gemini ───────────────────────────
/**
 * Produces a safe, anonymised summary object for the Gemini API.
 * Rules:
 *  - Store names replaced with generic IDs (e.g., "Merchant_001")
 *  - All email addresses stripped
 *  - Phone numbers stripped
 *  - Exact dollar figures stripped (they're not in the analytics payload anyway)
 *  - Only categorical/statistical data is retained
 *
 * @param {BobAnalyticsPayload} payload
 * @param {object[]} merchants  - deduplicated merchants from bobParser (for ID mapping)
 * @returns {{ sanitizedPayload: object, idMap: object }}
 */
export const sanitizeBOBForAI = (payload, merchants) => {
  if (!payload) return { sanitizedPayload: null, idMap: {} };

  // Build a merchant name → generic ID mapping
  const idMap = {};
  merchants.forEach((m, i) => {
    idMap[m.merchantName] = `Merchant_${String(i + 1).padStart(3, "0")}`;
  });

  const EMAIL_RE  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const PHONE_RE  = /(\+?\d[\s\-.]?){7,14}/g;
  const DOLLAR_RE = /\$[\d,]+(\.\d{1,2})?/g;

  const stripPII = (str) =>
    String(str ?? "")
      .replace(EMAIL_RE, "[email]")
      .replace(PHONE_RE, "[phone]")
      .replace(DOLLAR_RE, "[amount]");

  // Sanitize widget distribution labels (status values could contain names)
  const safeWidgets = payload.widgets.map(w => ({
    column:  stripPII(w.rawHeader),
    type:    w.type,
    widget:  w.widget,
    ...(w.widget === "donut"      && { trueCount: w.trueCount, total: payload.totalRows }),
    ...(w.widget === "statusBar"  && { distribution: w.distribution.map(d => ({ label: stripPII(d.label), count: d.count, pct: d.pct })) }),
    ...(w.widget === "histogram"  && { histogram: w.histogram, avg: w.avg, max: w.max, untouched: w.untouched }),
    ...(w.widget === "recency"    && { ageBuckets: w.ageBuckets, totalWithDate: w.totalWithDate }),
  }));

  const sanitizedPayload = {
    totalLeads:  payload.totalRows,
    oppStats:    payload.oppStats,
    colorGroups: payload.colorGroups.map(c => ({ hex: c.hex, count: c.count, label: c.label || "Unlabeled" })),
    widgets:     safeWidgets,
    meta: {
      hasColorData:  payload.hasColorData,
      hasTouchData:  payload.hasTouchData,
      hasStatusData: payload.hasStatusData,
    },
  };

  return { sanitizedPayload, idMap };
};

/**
 * Builds the prompt string for Gemini.
 * @param {object} sanitizedPayload - output of sanitizeBOBForAI
 * @returns {string}
 */
export const buildGeminiPrompt = (sanitizedPayload) => {
  const data = JSON.stringify(sanitizedPayload, null, 2);
  return `You are an expert DoorDash Merchant Success sales analyst. You are helping a DoorDash Account Manager review their Book of Business data.

The following JSON contains a statistical summary of their lead list. All personally identifiable information has been removed. Only categorical data and opportunity flags are included.

=== BOB ANALYTICS PAYLOAD ===
${data}
=== END PAYLOAD ===

Based on this data, provide a concise, high-value analysis in the following JSON structure. Return ONLY valid JSON, no markdown:
{
  "priorityInsights": [
    "One sentence insight about the most important pattern in the data"
  ],
  "quickWins": [
    "One sentence describing a specific high-conversion opportunity"
  ],
  "riskFlags": [
    "One sentence describing a risk or gap in the data"
  ],
  "suggestedCampaignFocus": "One sentence recommending which promo type to lead with and why",
  "pipelineScore": <integer 0-100 representing overall pipeline health>
}

Rules:
- priorityInsights: max 3 items
- quickWins: max 3 items
- riskFlags: max 2 items
- Be specific with numbers from the data
- Do not invent data not present in the payload`;
};
