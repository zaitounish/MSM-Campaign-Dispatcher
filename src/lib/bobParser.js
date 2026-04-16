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
    dmEmail: -1,
    storeEmail: -1,
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
    if (normalized.includes("dm email") || normalized.includes("decision maker") || normalized === "dm") {
      if (colMap.dmEmail === -1) colMap.dmEmail = idx;
    }
    if (normalized.includes("store email") || normalized === "email") {
      if (colMap.storeEmail === -1) colMap.storeEmail = idx;
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
      dmEmail: getVal(colMap.dmEmail),
      storeEmail: getVal(colMap.storeEmail),
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
        // Supplement missing emails from siblings if needed
        if (!existing.dmEmail && row.dmEmail) existing.dmEmail = row.dmEmail;
        if (!existing.storeEmail && row.storeEmail) existing.storeEmail = row.storeEmail;
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
        if (!existing.storeEmail && row.storeEmail) existing.storeEmail = row.storeEmail;
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
    // Collect all possible emails from dm and store
    const rawEmails = [target.dmEmail, target.storeEmail].filter(Boolean);
    // Split by comma/space to handle multiple emails in a single cell, then filter valid ones
    const uniqueEmails = [...new Set(
      rawEmails.flatMap(e => e.split(/[,\s]+/).map(ex => ex.trim()).filter(validateEmail))
    )];

    const emails = uniqueEmails.map((email, i) => ({
      address: email,
      isPrimary: i === 0
    }));
    
    return {
      id: crypto.randomUUID(),
      merchantName: target.merchantName,
      businessId: target.businessId || "",
      sids: target.sids.join(","),
      emails: emails,
      locationCount: target.sids.length,
      selected: true,
      hasCredits: false,
      creditAmount: "",
      creditExpiry: "",
      emailOverride: null,
    };
  }).filter(t => t.emails.length > 0); // only keep rows that have some email to target
};

function validateEmail(email) {
  return typeof email === 'string' && email.includes('@') && email.includes('.');
}
