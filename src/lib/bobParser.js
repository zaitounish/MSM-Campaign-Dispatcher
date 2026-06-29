// Email separator regex: splits on characters that can NEVER appear in a valid RFC 5321 email address
// Safe to split on: , ; : " ( ) | * $ #  and whitespace
// NOT included (valid in emails): - _ & + ' / @ . ! % ` ^ ~
const EMAIL_SEP_RE = /[,\s;:"'()|*$#]+/;

export const processSheetData = (json) => {
  if (!json || json.length < 2) return [];

  // Find header row (usually the first row with enough non-empty fields)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(json.length, 10); i++) {
    const row = json[i];
    if (row && row.filter(Boolean).length >= 3) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) return [];

  const rawHeaders = json[headerRowIdx];
  const colMap = {
    merchantName: -1,
    storeName: -1,     // separate fallback for "Store Name" column
    storeId: -1,
    businessId: -1,
    dmName: -1,
    dmEmail: -1,
    storeEmail: -1,
    slOpp: -1,
    promoOpp: -1,
    loyalOpp: -1,
    slCredit: -1,
  };

  rawHeaders.forEach((h, idx) => {
    if (!h) return;
    const normalized = String(h).toLowerCase().replace(/_/g, " ").trim().replace(/\s+/g, " ");

    // Business Name / Merchant Name → highest priority for the primary name
    if (normalized.includes("business name") || normalized.includes("merchant name")) {
      if (colMap.merchantName === -1) colMap.merchantName = idx;
    }
    // Store Name → separate fallback column
    if (normalized.includes("store name")) {
      if (colMap.storeName === -1) colMap.storeName = idx;
    }
    // Generic "name" fallback — only if neither of the above columns found yet
    if (normalized === "name" || (normalized.endsWith(" name") && colMap.merchantName === -1 && colMap.storeName === -1)) {
      if (colMap.merchantName === -1) colMap.merchantName = idx;
    }
    if (normalized.includes("store id") || normalized === "sid" || normalized === "st id" || normalized === "st_id") {
      if (colMap.storeId === -1) colMap.storeId = idx;
    }
    if (normalized.includes("business id") || normalized === "business_id" || normalized === "biz id" || normalized === "biz_id") {
      if (colMap.businessId === -1) colMap.businessId = idx;
    }
    if (normalized.includes("dm name") || normalized.includes("contact name") || normalized.includes("decision maker name") || normalized.includes("first name")) {
      if (colMap.dmName === -1) colMap.dmName = idx;
    }
    if (normalized.includes("dm email") || normalized.includes("decision maker") || normalized === "dm") {
      if (colMap.dmEmail === -1) colMap.dmEmail = idx;
    }
    if (normalized.includes("store email") || normalized === "email") {
      if (colMap.storeEmail === -1) colMap.storeEmail = idx;
    }
    if (normalized.includes("sl opp") || normalized === "sl_opp") {
      if (colMap.slOpp === -1) colMap.slOpp = idx;
    }
    if (normalized.includes("promo opp") || normalized === "promo_opp") {
      if (colMap.promoOpp === -1) colMap.promoOpp = idx;
    }
    if (normalized.includes("loyal opp") || normalized === "loyal_opp" || normalized.includes("loyalty opp")) {
      if (colMap.loyalOpp === -1) colMap.loyalOpp = idx;
    }
    if (normalized.includes("sl credit") || normalized === "sl_credit") {
      if (colMap.slCredit === -1) colMap.slCredit = idx;
    }
  });

  const parsedRows = [];

  for (let i = headerRowIdx + 1; i < json.length; i++) {
    const row = json[i];
    if (!row || row.length === 0) continue;

    const getVal = (colIdx) => {
      if (colIdx === -1 || colIdx >= row.length) return "";
      const val = row[colIdx];
      return val !== undefined && val !== null ? String(val).trim() : "";
    };

    const sId = getVal(colMap.storeId);
    // Ignore rows without a store ID or name
    if (!sId || sId === "0" || sId === "NaN" || sId === "-") continue;

    // Business Name → Store Name → blank (resolved later)
    const rawMerchantName = getVal(colMap.merchantName) || getVal(colMap.storeName) || "";

    parsedRows.push({
      merchantName: rawMerchantName,
      storeId: sId,
      businessId: getVal(colMap.businessId),
      dmName: getVal(colMap.dmName),
      dmEmail: getVal(colMap.dmEmail),
      storeEmail: getVal(colMap.storeEmail),
      slOpp: getVal(colMap.slOpp),
      promoOpp: getVal(colMap.promoOpp),
      loyalOpp: getVal(colMap.loyalOpp),
      slCredit: getVal(colMap.slCredit),
    });
  }

  // ── Two-Pass Deduplication Algorithm ────────────────────────────────────────
  // Key change: dmEmails and storeEmails are now ARRAYS so we collect ALL
  // email addresses from every sibling row — not just the first non-empty one.
  const pass1Map = new Map(); // by businessId
  const noBizIdRows = [];

  parsedRows.forEach((row) => {
    if (row.businessId && row.businessId.toLowerCase() !== "null" && row.businessId !== "0") {
      if (!pass1Map.has(row.businessId)) {
        const { dmEmail: _d, storeEmail: _s, ...cleanRow } = row;
        pass1Map.set(row.businessId, {
          ...cleanRow,
          sids: [row.storeId],
          // Normalize the seed row's emails the same way sibling rows are normalized
          // so comma-separated values (e.g. "a@x.com, b@x.com") are split correctly.
          dmEmails: row.dmEmail
            ? row.dmEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            : [],
          storeEmails: row.storeEmail
            ? row.storeEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            : [],
        });
      } else {
        const existing = pass1Map.get(row.businessId);
        if (!existing.sids.includes(row.storeId)) {
          existing.sids.push(row.storeId);
        }
        // Supplement missing fields from siblings
        if (!existing.dmName && row.dmName) existing.dmName = row.dmName;
        // Accumulate ALL emails from every sibling row (fixes multi-location email loss)
        if (row.dmEmail) {
          row.dmEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            .forEach(e => { if (!existing.dmEmails.includes(e)) existing.dmEmails.push(e); });
        }
        if (row.storeEmail) {
          row.storeEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            .forEach(e => { if (!existing.storeEmails.includes(e)) existing.storeEmails.push(e); });
        }
        // Logical OR for opportunities
        if (isTruthy(row.slOpp)) existing.slOpp = "1";
        if (isTruthy(row.promoOpp)) existing.promoOpp = "1";
        if (isTruthy(row.loyalOpp)) existing.loyalOpp = "1";
        if (isTruthy(row.slCredit)) existing.slCredit = "1";
        // Keep the best non-empty merchant name
        if (!existing.merchantName && row.merchantName) existing.merchantName = row.merchantName;
      }
    } else {
      noBizIdRows.push(row);
    }
  });

  const pass2Map = new Map(); // by dmEmail OR standalone if neither
  const finalResults = Array.from(pass1Map.values());

  noBizIdRows.forEach((row) => {
    // If it has a valid DM Email, group by that
    if (row.dmEmail && validateEmail(row.dmEmail)) {
      if (!pass2Map.has(row.dmEmail)) {
        const { dmEmail: _d, storeEmail: _s, ...cleanRow } = row;
        pass2Map.set(row.dmEmail, {
          ...cleanRow,
          sids: [row.storeId],
          dmEmails: row.dmEmail
            ? row.dmEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            : [],
          storeEmails: row.storeEmail
            ? row.storeEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            : [],
        });
      } else {
        const existing = pass2Map.get(row.dmEmail);
        if (!existing.sids.includes(row.storeId)) {
          existing.sids.push(row.storeId);
        }
        if (!existing.dmName && row.dmName) existing.dmName = row.dmName;
        if (row.storeEmail) {
          row.storeEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            .forEach(e => { if (!existing.storeEmails.includes(e)) existing.storeEmails.push(e); });
        }
        if (isTruthy(row.slOpp)) existing.slOpp = "1";
        if (isTruthy(row.promoOpp)) existing.promoOpp = "1";
        if (isTruthy(row.loyalOpp)) existing.loyalOpp = "1";
        if (isTruthy(row.slCredit)) existing.slCredit = "1";
        if (!existing.merchantName && row.merchantName) existing.merchantName = row.merchantName;
      }
    } else {
      // Group by storeEmail if dmEmail is missing
      if (row.storeEmail && validateEmail(row.storeEmail)) {
        if (!pass2Map.has(row.storeEmail)) {
          const { dmEmail: _d, storeEmail: _s, ...cleanRow } = row;
          pass2Map.set(row.storeEmail, {
            ...cleanRow,
            sids: [row.storeId],
            dmEmails: row.dmEmail
              ? row.dmEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
              : [],
            storeEmails: row.storeEmail
              ? row.storeEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
              : [],
          });
        } else {
          const existing = pass2Map.get(row.storeEmail);
          if (!existing.sids.includes(row.storeId)) {
            existing.sids.push(row.storeId);
          }
          if (row.dmEmail) {
            row.dmEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
              .forEach(e => { if (!existing.dmEmails.includes(e)) existing.dmEmails.push(e); });
          }
          if (isTruthy(row.slOpp)) existing.slOpp = "1";
          if (isTruthy(row.promoOpp)) existing.promoOpp = "1";
          if (isTruthy(row.loyalOpp)) existing.loyalOpp = "1";
          if (isTruthy(row.slCredit)) existing.slCredit = "1";
          if (!existing.merchantName && row.merchantName) existing.merchantName = row.merchantName;
        }
      } else {
        // No valid emails to group on, keep isolated
        const { dmEmail: _d, storeEmail: _s, ...cleanRow } = row;
        finalResults.push({
          ...cleanRow,
          sids: [row.storeId],
          dmEmails: row.dmEmail
            ? row.dmEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            : [],
          storeEmails: row.storeEmail
            ? row.storeEmail.split(EMAIL_SEP_RE).map(e => e.trim().toLowerCase()).filter(Boolean)
            : [],
        });
      }
    }
  });

  // ── Pass 3: Cross-map email deduplication ─────────────────────────────────
  // A merchant with a businessId (pass1) may share a dmEmail with a no-biz-id
  // merchant grouped by email (pass2). Without this pass, that person receives
  // two separate email drafts. We merge any record from pass2 that shares an
  // email address with an already-present pass1 record.
  const emailToFinalIdx = new Map(); // email → index in finalResults

  // Index the existing pass1 records by their email addresses
  finalResults.forEach((merchant, idx) => {
    for (const email of merchant.dmEmails) {
      if (!emailToFinalIdx.has(email)) emailToFinalIdx.set(email, idx);
    }
    for (const email of merchant.storeEmails) {
      if (!emailToFinalIdx.has(email)) emailToFinalIdx.set(email, idx);
    }
  });

  // Walk pass2 records and either merge into an existing record or append
  for (const p2Merchant of pass2Map.values()) {
    let mergedIntoIdx = -1;
    for (const email of [...p2Merchant.dmEmails, ...p2Merchant.storeEmails]) {
      if (emailToFinalIdx.has(email)) {
        mergedIntoIdx = emailToFinalIdx.get(email);
        break;
      }
    }

    if (mergedIntoIdx >= 0) {
      // Merge sids and emails into the existing pass1 record
      const existing = finalResults[mergedIntoIdx];
      p2Merchant.sids.forEach(sid => { if (!existing.sids.includes(sid)) existing.sids.push(sid); });
      p2Merchant.dmEmails.forEach(e => { if (!existing.dmEmails.includes(e)) { existing.dmEmails.push(e); emailToFinalIdx.set(e, mergedIntoIdx); } });
      p2Merchant.storeEmails.forEach(e => { if (!existing.storeEmails.includes(e)) { existing.storeEmails.push(e); emailToFinalIdx.set(e, mergedIntoIdx); } });
      if (!existing.dmName && p2Merchant.dmName) existing.dmName = p2Merchant.dmName;
      if (!existing.merchantName && p2Merchant.merchantName) existing.merchantName = p2Merchant.merchantName;
      if (isTruthy(p2Merchant.slOpp)) existing.slOpp = "1";
      if (isTruthy(p2Merchant.promoOpp)) existing.promoOpp = "1";
      if (isTruthy(p2Merchant.loyalOpp)) existing.loyalOpp = "1";
      if (isTruthy(p2Merchant.slCredit)) existing.slCredit = "1";
    } else {
      // No overlap — add as a new record and index its emails
      const newIdx = finalResults.length;
      finalResults.push(p2Merchant);
      p2Merchant.dmEmails.forEach(e => { if (!emailToFinalIdx.has(e)) emailToFinalIdx.set(e, newIdx); });
      p2Merchant.storeEmails.forEach(e => { if (!emailToFinalIdx.has(e)) emailToFinalIdx.set(e, newIdx); });
    }
  }

  // Formatting final targets schema
  return finalResults.map((target) => {
    // Collect ALL raw email candidates from both dmEmails and storeEmails arrays.
    // These were accumulated across every sibling/duplicate row during dedup.
    const rawCandidates = [
      ...(target.dmEmails || []),
      ...(target.storeEmails || []),
    ]
      .flatMap(e => e.split(EMAIL_SEP_RE).map(ex => ex.trim().toLowerCase()).filter(Boolean));

    // Separate valid from invalid so we can surface bad ones to the rep
    const validEmails = rawCandidates.filter(validateEmail);
    const invalidEmails = rawCandidates.filter(e => !validateEmail(e));

    // Build unique email list with source tracking (dm vs store column)
    // dmEmails go first, so the first valid dm email gets isPrimary
    const dmSet = new Set(target.dmEmails || []);
    const uniqueValid = [...new Set(validEmails)];
    const emails = uniqueValid.map((email, i) => ({
      address: email,
      isPrimary: i === 0,
      source: dmSet.has(email) ? "dm" : "store",
    }));

    // Determine email health for the UI
    let emailStatus;   // "valid" | "invalid" | "missing"
    let rawEmailIssue; // the bad address string, for display
    if (emails.length > 0) {
      emailStatus = "valid";
    } else if (invalidEmails.length > 0) {
      emailStatus = "invalid";
      rawEmailIssue = invalidEmails[0]; // show the first bad one
    } else {
      emailStatus = "missing";
    }

    // Business Name fallback chain: merchantName → Store #ID → (never "Unknown Merchant")
    const resolvedName = target.merchantName && target.merchantName.trim()
      ? target.merchantName.trim()
      : `Store #${target.sids[0] || "?"}`;

    return {
      id: crypto.randomUUID(),
      merchantName: resolvedName,
      businessId: target.businessId || "",
      sids: target.sids.join(","),
      emails,
      locationCount: target.sids.length,
      originalSids: target.sids.join(","),
      dmName: target.dmName || "",
      selected: emailStatus === "valid", // auto-deselect merchants with bad/missing email
      hasCredits: false,
      creditAmount: "",
      creditExpiry: "",
      emailOverride: null,
      subjectOverride: null,
      slOpp: isTruthy(target.slOpp),
      promoOpp: isTruthy(target.promoOpp),
      loyalOpp: isTruthy(target.loyalOpp),
      slCredit: isTruthy(target.slCredit),
      // Email validation metadata
      emailStatus,
      rawEmailIssue: rawEmailIssue || null,
    };
  }); // keep ALL rows | UI handles invalid/missing display
};

function isTruthy(val) {
  if (!val) return false;
  const v = String(val).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || (parseFloat(v) > 0);
}

// RFC-5321 inspired regex | catches the common malformed patterns
// (missing TLD, double @, no local part, spaces, etc.) without being
// so strict it rejects valid corporate addresses.
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function validateEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}
