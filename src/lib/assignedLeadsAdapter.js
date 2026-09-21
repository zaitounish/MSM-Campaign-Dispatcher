import { processSheetData } from "./bobParser";

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

  return processSheetData([header, ...rows]);
}
