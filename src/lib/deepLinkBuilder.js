/**
 * deepLinkBuilder.js
 *
 * Generates spec-compliant DoorDash campaign deep links for all promo types.
 *
 * Technical References:
 *   - SL Campaign Deep Link Generation (Stage 3).md
 *   - Campaign Deep Link Routing & Edge Cases.md
 *
 * Key rules enforced:
 *  - SL budgets: abwv = weekly*100, abv = floor(weekly/7)*100
 *  - SL $99 fallback: if weeklyBudget is falsy, default to 99 before cents conversion
 *  - dsd = Date.now() injected per link (SL and Smart/SpendXGetY)
 *  - sids encoded: encodeURIComponent(array.join(",")) → %2C separator
 *  - assisted_rep_id sourced from repSettings.repId — never hardcoded
 *  - Loyalty: no sids, no dsd, no repId — only business_id
 *  - SpendXGetY: conditional pt=pdws vs pt=dvdws; financials in cents; % as raw int
 */

// ─── Base URLs ────────────────────────────────────────────────────────────────
const SL_BASE_URL        = "https://www.doordash.com/merchant/marketing/sl/create";
const SMART_BASE_URL     = "https://www.doordash.com/merchant/marketing/smart/create";
const SPENDXGETY_BASE_URL = "https://www.doordash.com/merchant/marketing/spendxgety/create";
const LOYALTY_BASE_URL   = "https://www.doordash.com/merchant/loyalty";

// ─── Audience Map ─────────────────────────────────────────────────────────────
/**
 * Maps UI-facing dropdown values to the exact internal DoorDash DB strings.
 * CRITICAL: Any deviation from these exact strings causes broken routing.
 *
 * smart_targeting added per spec §4C for Smart/SpendXGetY campaigns.
 */
export const AUDIENCE_MAP = {
  all:                            "all",
  new_to_merchant:                "new_to_merchant",
  existing_consumers_to_merchant: "existing_consumers_to_merchant",
  churned_users:                  "churned_users",
  smart_targeting:                "smart_targeting",  // Required by Smart & SpendXGetY campaigns
};

// ─── Shared Helper ────────────────────────────────────────────────────────────
/**
 * Encodes an array of Store IDs per spec §3:
 * commas MUST be %2C encoded to prevent DoorDash routing failures.
 * We use encodeURIComponent and NOT URLSearchParams (which would double-encode).
 */
const encodeSids = (sidsArray) => encodeURIComponent((sidsArray || []).join(","));

// ─── 1. Sponsored Listing (SL) Generator ─────────────────────────────────────
/**
 * Generates a spec-compliant SL campaign deep link.
 *
 * $99 Fallback (Spec §1 Edge Cases):
 *   If weeklyBudget is falsy (0, empty, undefined), the system defaults to $99
 *   to prevent abv=0&abwv=0 from crashing the DoorDash destination form.
 *
 * @param {string|number} businessId     - Parent Business ID from BOB.
 * @param {string[]}      sidsArray      - Array of Store IDs (multi-location safe).
 * @param {string|number} repId          - repSettings.repId — never hardcoded.
 * @param {number}        weeklyBudget   - Weekly budget in whole dollars.
 * @param {string}        audienceKey    - AUDIENCE_MAP key (e.g., "new_to_merchant").
 * @returns {string} Fully compiled SL URL.
 */
export const generateDeepLink = ({ businessId, sidsArray, repId, weeklyBudget, audienceKey }) => {
  // $99 fallback: prevents abv=0 / abwv=0 crashing the DoorDash form
  const weekly = parseFloat(weeklyBudget) || 99;
  const abwv   = Math.round(weekly * 100);           // Weekly budget in cents
  const abv    = Math.floor(weekly / 7) * 100;       // Daily budget in cents (floor per spec)

  const encodedSids    = encodeSids(sidsArray);
  const dsd            = Date.now();
  const aud            = AUDIENCE_MAP[audienceKey] || "all";
  const assistedRepId  = repId || "";

  // Manual string construction — URLSearchParams would double-encode the %2C in sids
  const params = [
    `business_id=${businessId}`,
    `aud=${aud}`,
    `dsd=${dsd}`,
    `iftca=false`,
    `sids=${encodedSids}`,
    `assisted_rep_id=${assistedRepId}`,
    `abv=${abv}`,
    `abwv=${abwv}`,
    `bsao=0`,
    `bscv=500`,
    `bsia=true`,
    `sch_ad=true`,
  ].join("&");

  return `${SL_BASE_URL}?${params}`;
};

// ─── 2. Smart Campaign Generator ─────────────────────────────────────────────
/**
 * Generates a Smart Campaign deep link (both Item & Discount types share the same URL).
 *
 * Key spec rules:
 *  - Audience is ALWAYS smart_targeting (static, not user-configurable)
 *  - Budget params are static strings "noBudget" (not zero, not cents)
 *  - No financial inputs from the rep are required
 *
 * @param {object}        merchant  - Merchant object from Stage 2.
 * @param {string|number} repId     - repSettings.repId.
 * @returns {string} Smart campaign URL.
 */
export const generateSmartLink = (merchant, repId) => {
  const dsd          = Date.now();
  const encodedSids  = encodeSids(
    merchant.originalSids ? merchant.originalSids.split(",") : [merchant.storeId]
  );

  const params = [
    `business_id=${merchant.businessId}`,
    `aud=smart_targeting`,
    `dsd=${dsd}`,
    `iftca=false`,
    `sids=${encodedSids}`,
    `assisted_rep_id=${repId || ""}`,
    `pt=undefined`,
    `mst=0`,
    `pbv=noBudget`,
    `pbwv=noBudget`,
    `pbic=false`,
    `sch_ad=true`,
  ].join("&");

  return `${SMART_BASE_URL}?${params}`;
};

// ─── 3. Loyalty Generator ─────────────────────────────────────────────────────
/**
 * Generates a Loyalty program deep link.
 *
 * Spec §3 rules (simplest routing in the system):
 *  - Only business_id is required — no sids, no dsd, no repId
 *  - Uses the /merchant/loyalty base (not /marketing/)
 *
 * @param {object} merchant - Merchant object from Stage 2.
 * @returns {string} Loyalty URL.
 */
export const generateLoyaltyLink = (merchant) => {
  return `${LOYALTY_BASE_URL}?business_id=${merchant.businessId}`;
};

// ─── 4. Spend X Get Y Generator ──────────────────────────────────────────────
/**
 * Generates a conditional Spend X Get Y (discount) deep link.
 *
 * Two modes — determined by config.discountType:
 *
 * Mode 1: "percentage" → pt=pdws
 *   - cpo = raw percentage integer (NOT cents) e.g. 20% → cpo=20
 *   - mst = minSubtotal in cents
 *   - cmpv = maxDiscount cap in cents
 *
 * Mode 2: "dollar" → pt=dvdws
 *   - cfo = dollarAmount in cents
 *   - mst = minSubtotal in cents
 *   - cmpv is OMITTED entirely from the URL
 *
 * @param {object}        merchant - Merchant object from Stage 2.
 * @param {string|number} repId    - repSettings.repId.
 * @param {object}        config   - PromoConfigs entry for "discount".
 * @returns {string} SpendXGetY URL.
 */
export const generateSpendXGetYLink = (merchant, repId, config) => {
  const dsd         = Date.now();
  const encodedSids = encodeSids(
    merchant.originalSids ? merchant.originalSids.split(",") : [merchant.storeId]
  );
  const mstCents = Math.round((parseFloat(config.minSubtotal) || 0) * 100);

  // Base parameters shared by both modes
  let params = [
    `business_id=${merchant.businessId}`,
    `aud=smart_targeting`,
    `dsd=${dsd}`,
    `iftca=false`,
    `sids=${encodedSids}`,
    `assisted_rep_id=${repId || ""}`,
    `mst=${mstCents}`,
    `pbv=noBudget`,
    `pbwv=noBudget`,
    `pbic=false`,
    `sch_ad=true`,
  ].join("&");

  if (config.discountType === "percentage") {
    // cpo is the raw percentage — NOT converted to cents
    const cpo       = parseInt(config.percentageAmount) || 0;
    const cmpvCents = Math.round((parseFloat(config.maxDiscount) || 0) * 100);
    params += `&pt=pdws&cpo=${cpo}&cmpv=${cmpvCents}`;

  } else if (config.discountType === "dollar") {
    // cfo is converted to cents; cmpv is omitted entirely (per spec)
    const cfoCents = Math.round((parseFloat(config.dollarAmount) || 0) * 100);
    params += `&pt=dvdws&cfo=${cfoCents}`;
  }

  return `${SPENDXGETY_BASE_URL}?${params}`;
};

// ─── 5. Master Link Builder ───────────────────────────────────────────────────
/**
 * Maps over all selected merchants × selected promos and generates the
 * appropriate deep link per promo type, attaching it to the result map.
 *
 * @param {object[]} merchants      - Filtered active merchants from Stage 2.
 * @param {string[]} selectedPromos - Selected promo IDs.
 * @param {object}   promoConfigs   - { [promoId]: config }
 * @param {string}   repId          - repSettings.repId from global App state.
 * @returns {object} { [merchantId]: { [promoId]: string|null } }
 */
export const buildAllDeepLinks = (merchants, selectedPromos, promoConfigs, repId) => {
  const links = {};

  merchants.forEach((merchant) => {
    links[merchant.id] = {};
    const sidsArray = merchant.originalSids
      ? merchant.originalSids.split(",")
      : [merchant.storeId];

    selectedPromos.forEach((promoId) => {
      const config = promoConfigs[promoId] || {};

      switch (promoId) {

        case "ads":
          // Unified SL advertise link — uses budget & audience from PromoCustomizer
          links[merchant.id][promoId] = generateDeepLink({
            businessId:   merchant.businessId,
            sidsArray,
            repId,
            weeklyBudget: config.budget,        // $99 fallback applied inside generateDeepLink
            audienceKey:  config.audience || "all",
          });
          break;

        case "smart_campaign":
          // Smart campaign — static params, no rep budget input needed
          links[merchant.id][promoId] = generateSmartLink(merchant, repId);
          break;

        case "loyalty":
          // Loyalty — simplest link: only business_id, no repId injection
          links[merchant.id][promoId] = generateLoyaltyLink(merchant);
          break;

        case "discount":
          // Spend X Get Y — conditional percentage vs dollar routing
          links[merchant.id][promoId] = generateSpendXGetYLink(merchant, repId, config);
          break;

        default:
          // BOGO, delivery_fee, happy_hour, lunch_specials — no SL deep link
          links[merchant.id][promoId] = null;
          break;
      }
    });
  });

  return links;
};
