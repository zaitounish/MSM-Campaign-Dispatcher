/**
 * deepLinkBuilder.js
 *
 * Generates spec-compliant DoorDash campaign deep links for all promo types.
 *
 * Technical References:
 *   - MSM Campaign Dispatcher: Deep Link Architecture Blueprint
 *
 * Key rules enforced:
 *  - SL budgets: abwv = weekly*100, abv = floor(weekly/7)*100
 *  - SL $99 fallback: if weeklyBudget is falsy, default to 99 before cents conversion
 *  - dsd = Date.now() injected per link
 *  - sids encoded: encodeURIComponent(array.join(",")) → %2C separator
 *  - assisted_rep_id sourced from repSettings.repId | never hardcoded
 *  - Loyalty: no sids, no dsd, no repId | only business_id
 *  - SpendXGetY: conditional pt=pdws vs pt=dvdws; financials in cents; % as raw int
 *
 * CRITICAL BUG FIX: iftca=false is intentionally omitted from all URLs per blueprint.
 */

// ─── Base URLs ────────────────────────────────────────────────────────────────
const SL_BASE_URL            = "https://www.doordash.com/merchant/marketing/sl/create";
const SMART_BASE_URL         = "https://www.doordash.com/merchant/marketing/smart/create";
const SPENDXGETY_BASE_URL    = "https://www.doordash.com/merchant/marketing/spendxgety/create";
const LOYALTY_BASE_URL       = "https://www.doordash.com/merchant/loyalty";
const BOGO_BASE_URL          = "https://www.doordash.com/merchant/marketing/bogo/create";
const DDD_BASE_URL           = "https://www.doordash.com/merchant/marketing/ddd/create";
const HAPPY_HOUR_BASE_URL    = "https://www.doordash.com/merchant/marketing/cx_moment/create";
const LUNCH_SPECIAL_BASE_URL = "https://www.doordash.com/merchant/marketing/lunch_special/create";

// ─── Audience Map ─────────────────────────────────────────────────────────────
/**
 * Maps UI-facing dropdown values to the exact internal DoorDash DB strings.
 */
export const AUDIENCE_MAP = {
  all:                            "all",
  new_to_merchant:                "new_to_merchant",
  existing_consumers_to_merchant: "existing_consumers_to_merchant",
  churned_users:                  "churned_users",
  smart_targeting:                "smart_targeting",
};

// ─── Shared Helpers ───────────────────────────────────────────────────────────
/**
 * Encodes an array of Store IDs per spec:
 * commas MUST be %2C encoded.
 */
const encodeSids = (sidsArray) => encodeURIComponent((sidsArray || []).join(","));

/**
 * Generates the Global Parameters string array applicable to all complex campaigns.
 */
const getGlobalParams = (merchant, repId) => {
  const encodedSids = encodeSids(
    merchant.originalSids ? merchant.originalSids.split(",") : [merchant.storeId]
  );
  return [
    `business_id=${merchant.businessId}`,
    `sids=${encodedSids}`,
    `assisted_rep_id=${repId || ""}`,
    `dsd=${Date.now()}`,
    `sch_ad=true`,
    `pbv=noBudget`,
    `pbwv=noBudget`,
    `pbic=false`,
  ];
};

// ─── 1. Sponsored Listing (SL) Generator ─────────────────────────────────────
export const generateDeepLink = ({ businessId, sidsArray, repId, weeklyBudget, audienceKey }) => {
  const weekly = parseFloat(weeklyBudget) || 99;
  const abwv   = Math.round(weekly * 100);
  const abv    = Math.floor(weekly / 7) * 100;

  const encodedSids   = encodeSids(sidsArray);
  const dsd           = Date.now();
  const aud           = AUDIENCE_MAP[audienceKey] || "all";
  const assistedRepId = repId || "";

  const params = [
    `business_id=${businessId}`,
    `aud=${aud}`,
    `dsd=${dsd}`,
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
export const generateSmartLink = (merchant, repId, config = {}) => {
  const globals = getGlobalParams(merchant, repId);
  const params = [
    ...globals,
    `aud=smart_targeting`, // Aud is always smart_targeting
    `pt=undefined`,
    `mst=0`
  ];

  // Variation 2: Smart Spend X Get Y (Cart-Level)
  if (config.isCartLevel) {
    params.push(`is_smart_bogo=false`);
  }

  return `${SMART_BASE_URL}?${params.join("&")}`;
};

// ─── 3. Loyalty Generator ─────────────────────────────────────────────────────
export const generateLoyaltyLink = (merchant) => {
  return `${LOYALTY_BASE_URL}?business_id=${merchant.businessId}`;
};

// ─── 4. Spend X Get Y Generator ──────────────────────────────────────────────
export const generateSpendXGetYLink = (merchant, repId, config) => {
  const globals = getGlobalParams(merchant, repId);
  const mstCents = Math.round((parseFloat(config.minSubtotal) || 0) * 100);
  const aud = AUDIENCE_MAP[config.audience] || "all"; // Map aud based on user selection

  let params = [
    ...globals,
    `aud=${aud}`,
    `mst=${mstCents}`,
  ];

  if (config.discountType === "percentage") {
    const cpo       = parseInt(config.percentageAmount) || 0;
    const cmpvCents = Math.round((parseFloat(config.maxDiscount) || 0) * 100);
    params.push(`pt=pdws`, `cpo=${cpo}`, `cmpv=${cmpvCents}`);

  } else if (config.discountType === "dollar") {
    const cfoCents = Math.round((parseFloat(config.dollarAmount) || 0) * 100);
    params.push(`pt=dvdws`, `cfo=${cfoCents}`);
  }

  return `${SPENDXGETY_BASE_URL}?${params.join("&")}`;
};

// ─── 5. Buy 1, Get 1 Free (BOGO) Generator ───────────────────────────────────
export const generateBogoLink = (merchant, repId, config) => {
  const globals = getGlobalParams(merchant, repId);
  const aud = AUDIENCE_MAP[config.audience] || "all";
  
  const params = [
    ...globals,
    `aud=${aud}`,
    `pt=undefined`,
    `mst=0`,
    `aggregated_item_ids=`
  ];

  return `${BOGO_BASE_URL}?${params.join("&")}`;
};

// ─── 6. Pay Customer's Delivery Fee Generator ────────────────────────────────
export const generateDeliveryFeeLink = (merchant, repId, config) => {
  const globals = getGlobalParams(merchant, repId);
  const aud = AUDIENCE_MAP[config.audience] || "all";
  
  let mst = 2500;
  if (aud === "new_to_merchant") mst = 2000;
  if (aud === "existing_consumers_to_merchant" || aud === "churned_users") mst = 1500;

  const params = [
    ...globals,
    `aud=${aud}`,
    `pt=ddws`,
    `mst=${mst}`
  ];

  return `${DDD_BASE_URL}?${params.join("&")}`;
};

// ─── 7. Happy Hour / Lunch Specials (Lean URLs) ──────────────────────────────
export const generateLeanLink = (merchant, type) => {
  const base = type === "happy_hour" ? HAPPY_HOUR_BASE_URL : LUNCH_SPECIAL_BASE_URL;
  return `${base}?business_id=${merchant.businessId}`;
};

// ─── 8. Master Link Builder ──────────────────────────────────────────────────
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
          links[merchant.id][promoId] = generateDeepLink({
            businessId:   merchant.businessId,
            sidsArray,
            repId,
            weeklyBudget: config.budget,
            audienceKey:  config.audience || "all",
          });
          break;

        case "smart_campaign":
          links[merchant.id][promoId] = generateSmartLink(merchant, repId, config);
          break;

        case "loyalty":
          links[merchant.id][promoId] = generateLoyaltyLink(merchant);
          break;

        case "discount":
          links[merchant.id][promoId] = generateSpendXGetYLink(merchant, repId, config);
          break;

        case "bogo":
          links[merchant.id][promoId] = generateBogoLink(merchant, repId, config);
          break;

        case "delivery_fee":
          links[merchant.id][promoId] = generateDeliveryFeeLink(merchant, repId, config);
          break;

        case "happy_hour":
          links[merchant.id][promoId] = generateLeanLink(merchant, "happy_hour");
          break;

        case "lunch_specials":
          links[merchant.id][promoId] = generateLeanLink(merchant, "lunch_specials");
          break;

        default:
          links[merchant.id][promoId] = null;
          break;
      }
    });
  });

  return links;
};
