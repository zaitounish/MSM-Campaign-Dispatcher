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
    
    if (normalized.includes("merchant name") || normalized.includes("store name") || normalized.includes("business name")) {
      if (colMap.merchantName === -1) colMap.merchantName = idx;
    }
    if (normalized.includes("store id") || normalized === "sid") {
      if (colMap.storeId === -1) colMap.storeId = idx;
    }
    if (normalized.includes("business id") || normalized === "business_id") {
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

    parsedRows.push({
      merchantName: getVal(colMap.merchantName) || "Unknown Merchant",
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

  // Two-Pass Deduplication Algorithm
  const pass1Map = new Map(); // by businessId
  const noBizIdRows = [];

  parsedRows.forEach((row) => {
    if (row.businessId && row.businessId.toLowerCase() !== "null" && row.businessId !== "0") {
      if (!pass1Map.has(row.businessId)) {
        pass1Map.set(row.businessId, { ...row, sids: [row.storeId] });
      } else {
        const existing = pass1Map.get(row.businessId);
        if (!existing.sids.includes(row.storeId)) {
          existing.sids.push(row.storeId);
        }
        // Supplement missing emails/names from siblings if needed
        if (!existing.dmName && row.dmName) existing.dmName = row.dmName;
        if (!existing.dmEmail && row.dmEmail) existing.dmEmail = row.dmEmail;
        if (!existing.storeEmail && row.storeEmail) existing.storeEmail = row.storeEmail;
        // Logical OR for opportunities
        if (isTruthy(row.slOpp)) existing.slOpp = "1";
        if (isTruthy(row.promoOpp)) existing.promoOpp = "1";
        if (isTruthy(row.loyalOpp)) existing.loyalOpp = "1";
        if (isTruthy(row.slCredit)) existing.slCredit = "1";
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
        pass2Map.set(row.dmEmail, { ...row, sids: [row.storeId] });
      } else {
        const existing = pass2Map.get(row.dmEmail);
        if (!existing.sids.includes(row.storeId)) {
          existing.sids.push(row.storeId);
        }
        if (!existing.dmName && row.dmName) existing.dmName = row.dmName;
        if (!existing.storeEmail && row.storeEmail) existing.storeEmail = row.storeEmail;
        if (isTruthy(row.slOpp)) existing.slOpp = "1";
        if (isTruthy(row.promoOpp)) existing.promoOpp = "1";
        if (isTruthy(row.loyalOpp)) existing.loyalOpp = "1";
        if (isTruthy(row.slCredit)) existing.slCredit = "1";
      }
    } else {
      // Group by storeEmail if dmEmail is missing
      if (row.storeEmail && validateEmail(row.storeEmail)) {
        if (!pass2Map.has(row.storeEmail)) {
          pass2Map.set(row.storeEmail, { ...row, sids: [row.storeId] });
        } else {
           const existing = pass2Map.get(row.storeEmail);
           if (!existing.sids.includes(row.storeId)) {
             existing.sids.push(row.storeId);
           }
           if (isTruthy(row.slOpp)) existing.slOpp = "1";
           if (isTruthy(row.promoOpp)) existing.promoOpp = "1";
           if (isTruthy(row.loyalOpp)) existing.loyalOpp = "1";
           if (isTruthy(row.slCredit)) existing.slCredit = "1";
        }
      } else {
        // No valid emails to group on, keep isolated
        finalResults.push({ ...row, sids: [row.storeId] });
      }
    }
  });

  finalResults.push(...pass2Map.values());

  // Formatting final targets schema
  return finalResults.map((target) => {
    // Collect all raw email candidates
    const rawCandidates = [target.dmEmail, target.storeEmail]
      .filter(Boolean)
      .flatMap(e => e.split(/[,\s]+/).map(ex => ex.trim()).filter(Boolean));

    // Separate valid from invalid so we can surface bad ones to the rep
    const validEmails   = rawCandidates.filter(validateEmail);
    const invalidEmails = rawCandidates.filter(e => !validateEmail(e));

    const uniqueValid = [...new Set(validEmails)];
    const emails = uniqueValid.map((email, i) => ({ address: email, isPrimary: i === 0 }));

    // Determine email health for the UI
    let emailStatus;   // "valid" | "invalid" | "missing"
    let rawEmailIssue; // the bad address string, for display
    if (emails.length > 0) {
      emailStatus = "valid";
    } else if (invalidEmails.length > 0) {
      emailStatus  = "invalid";
      rawEmailIssue = invalidEmails[0]; // show the first bad one
    } else {
      emailStatus = "missing";
    }

    return {
      id: crypto.randomUUID(),
      merchantName: target.merchantName,
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
  }); // keep ALL rows — UI handles invalid/missing display
};

function isTruthy(val) {
  if (!val) return false;
  const v = String(val).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || (parseInt(v) > 0);
}

// RFC-5321 inspired regex — catches the common malformed patterns
// (missing TLD, double @, no local part, spaces, etc.) without being
// so strict it rejects valid corporate addresses.
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function validateEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}
