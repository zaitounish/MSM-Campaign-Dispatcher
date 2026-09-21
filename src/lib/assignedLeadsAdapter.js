import { processSheetData } from "./bobParser.js";

/**
 * Transforms raw Supabase `assigned_leads` rows into the unified Merchant pipeline format.
 * Utilizes the battle-tested 3-pass deduplication and email health validation from bobParser.
 *
 * @param {Array<object>} assignedLeads - Rows fetched from `assigned_leads` table.
 * @returns {Array<object>} Processed merchant array ready for MerchantTable.
 */
export function transformAssignedLeadsToMerchants(assignedLeads) {
  if (!assignedLeads || assignedLeads.length === 0) return [];

  const header = [
    "Store Id",
    "Business Id",
    "Business Name",
    "DM Name",
    "DM Email",
    "Store Email",
    "Promo Opp",
    "Opp Type",
  ];

  const rows = assignedLeads.map((l) => [
    l.store_id || "",
    l.business_id || "",
    l.business_name || "",
    l.dm_name || [l.dm_first_name, l.dm_last_name].filter(Boolean).join(" "),
    l.email || "", // Decision Maker email
    "",            // Store email
    "1",           // Promo opp flag (client promo campaign)
    l.opp_type || "",
  ]);

  const merchants = processSheetData([header, ...rows]);

  // Build fallback lookup by businessId and storeId to ensure oppType is never lost
  const oppMap = new Map();
  assignedLeads.forEach((l) => {
    if (l.opp_type && l.opp_type.trim() && l.opp_type !== "#N/A") {
      if (l.business_id) oppMap.set(String(l.business_id).trim().toLowerCase(), l.opp_type.trim());
      if (l.store_id) oppMap.set(String(l.store_id).trim().toLowerCase(), l.opp_type.trim());
    }
  });

  return merchants.map((m) => {
    let resolved = (m.oppType || "").trim();
    if (!resolved || resolved === "#N/A") {
      if (m.businessId && oppMap.has(m.businessId.toLowerCase())) {
        resolved = oppMap.get(m.businessId.toLowerCase());
      } else if (m.sids) {
        for (const s of m.sids.split(",")) {
          if (oppMap.has(s.trim().toLowerCase())) {
            resolved = oppMap.get(s.trim().toLowerCase());
            break;
          }
        }
      }
    }
    return {
      ...m,
      isSpiff: true,
      oppType: resolved || "",
    };
  });
}
