const BASE_URL = "https://www.doordash.com/merchant/marketing/sl/create";

const STATIC_PARAMS = {
  bsia: "true",
  bsao: "0",
};

const toCents = (dollarStr) => {
  const parsed = parseFloat(dollarStr);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
};

export const buildDeepLink = ({ businessId, sids, audience, repId, promoParams = {} }) => {
  const p = new URLSearchParams();
  
  if (businessId) p.set("business_id", businessId);
  if (sids) p.set("sids", sids);
  if (audience) p.set("aud", audience);
  if (repId) p.set("assisted_rep_id", repId);
  
  // Dynamic financial params encoded
  Object.entries(promoParams).forEach(([key, val]) => {
    if (val !== null && val !== undefined && val !== "") {
      p.set(key, String(val));
    }
  });

  // Inject generic static params
  Object.entries(STATIC_PARAMS).forEach(([key, val]) => {
    p.set(key, val);
  });

  return `${BASE_URL}?${p.toString()}`;
};

export const buildAllDeepLinks = (merchants, selectedPromos, promoConfigs, repId) => {
  const links = {};

  merchants.forEach((m) => {
    links[m.id] = {};

    selectedPromos.forEach((promoId) => {
      const config = promoConfigs[promoId] || {};
      let audience = null;
      let promoParams = {};

      switch (promoId) {
        case "ads_all":
          audience = "all";
          promoParams.sch_ad = "true";
          if (config.budget) promoParams.abv = toCents(config.budget);
          break;
          
        case "ads_new":
          audience = "new_to_merchant";
          promoParams.sch_ad = "true";
          if (config.budget) promoParams.abv = toCents(config.budget);
          break;
          
        case "discount":
          audience = config.audience || null; // all, new_to_merchant, etc. from UI selection
          if (config.discountAmount) promoParams.bscv = toCents(config.discountAmount);
          break;
          
        case "happy_hour":
        case "lunch_specials":
          audience = "all";
          if (config.discountAmount) promoParams.bscv = toCents(config.discountAmount);
          break;

        case "loyalty":
        case "bogo":
        case "delivery_fee":
        case "smart_campaign":
          // no extra encoded financial API params defined for these in the spec
          break;
      }

      links[m.id][promoId] = buildDeepLink({
        businessId: m.businessId,
        sids: m.sids,
        audience,
        repId,
        promoParams
      });
    });
  });

  return links;
};
