import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateDeepLink } from "../deepLinkBuilder.js";

// Mirror pure functions from emailBlockEngine for contract and behavior testing
function formatDmName(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digitCount = (trimmed.match(/[\d\-().+\s]/g) || []).length;
  if (digitCount / trimmed.length > 0.5) return null;
  const firstWord = trimmed.split(/\s+/)[0];
  if (!firstWord) return null;
  const clean = firstWord.replace(/[^a-zA-Z'-]/g, "");
  if (!clean) return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function deInterpolateMerchant(html, merchant = {}) {
  if (!html) return "";
  const { merchantName, dmName } = merchant;

  const subs = [];

  // 1. Store name & its HTML-encoded variants
  if (merchantName && merchantName !== "Merchant Partner") {
    subs.push({ from: merchantName, to: "{Store Name}" });
    const ampVariant = merchantName.replace(/&/g, "&amp;");
    const aposVariant = merchantName.replace(/'/g, "&#39;");
    const aposNamedVariant = merchantName.replace(/'/g, "&apos;");
    const bothVariant = ampVariant.replace(/'/g, "&#39;");
    if (ampVariant !== merchantName) subs.push({ from: ampVariant, to: "{Store Name}" });
    if (aposVariant !== merchantName) subs.push({ from: aposVariant, to: "{Store Name}" });
    if (aposNamedVariant !== merchantName) subs.push({ from: aposNamedVariant, to: "{Store Name}" });
    if (bothVariant !== merchantName) subs.push({ from: bothVariant, to: "{Store Name}" });
  }

  // 2. DM Name: both raw spreadsheet value AND the formatted greeting first name (formatDmName)
  const formattedDm = formatDmName(dmName);
  if (formattedDm && formattedDm !== merchantName && formattedDm !== "there" && formattedDm !== "Merchant Partner") {
    subs.push({ from: formattedDm, to: "{DM Name}" });
  }
  if (dmName && dmName !== merchantName && dmName !== formattedDm && dmName !== "there" && dmName !== "Merchant Partner") {
    subs.push({ from: dmName, to: "{DM Name}" });
    const dmFirstWord = dmName.trim().split(/\s+/)[0];
    if (dmFirstWord && dmFirstWord.length > 1 && dmFirstWord !== formattedDm && dmFirstWord !== dmName) {
      subs.push({ from: dmFirstWord, to: "{DM Name}" });
    }
  }

  // 3. Greeting fallback: "{Store Name} team" (used when DM name is absent in _interpolate)
  if (merchantName && merchantName !== "Merchant Partner") {
    subs.push({ from: `${merchantName} team`, to: "{Store Name} team" });
    subs.push({ from: `${merchantName.replace(/'/g, "&#39;")} team`, to: "{Store Name} team" });
    subs.push({ from: `${merchantName.replace(/&/g, "&amp;")} team`, to: "{Store Name} team" });
  }

  // Deduplicate and sort longest first to avoid partial-match collisions
  const seen = new Set();
  const uniqueSubs = [];
  for (const s of subs) {
    if (!s.from || s.from.length < 2 || seen.has(s.from)) continue;
    seen.add(s.from);
    uniqueSubs.push(s);
  }
  uniqueSubs.sort((a, b) => b.from.length - a.from.length);

  let result = html;
  for (const { from, to } of uniqueSubs) {
    result = result.split(from).join(to);
  }
  return result;
}

const PROMO_BASE_PATTERNS = [
  { promoId: "ads", regex: /https:\/\/www\.doordash\.com\/merchant\/marketing\/sl\/create[^\s"'>]*/gi },
  { promoId: "smart_campaign", regex: /https:\/\/www\.doordash\.com\/merchant\/marketing\/smart\/create[^\s"'>]*/gi },
  { promoId: "loyalty", regex: /https:\/\/www\.doordash\.com\/merchant\/loyalty[^\s"'>]*/gi },
  { promoId: "discount", regex: /https:\/\/www\.doordash\.com\/merchant\/marketing\/spendxgety\/create[^\s"'>]*/gi },
  { promoId: "bogo", regex: /https:\/\/www\.doordash\.com\/merchant\/marketing\/bogo\/create[^\s"'>]*/gi },
  { promoId: "delivery_fee", regex: /https:\/\/www\.doordash\.com\/merchant\/marketing\/ddd\/create[^\s"'>]*/gi },
  { promoId: "happy_hour", regex: /https:\/\/www\.doordash\.com\/merchant\/marketing\/cx_moment\/create[^\s"'>]*/gi },
  { promoId: "lunch_specials", regex: /https:\/\/www\.doordash\.com\/merchant\/marketing\/lunch_special\/create[^\s"'>]*/gi },
];

function deInjectDeepLinks(html, dlMap = {}) {
  if (!html) return "";
  let result = html;
  Object.entries(dlMap).forEach(([promoId, url]) => {
    if (!url) return;
    const token = `%%DD_LINK_${promoId}%%`;
    const variants = new Set();
    variants.add(url);
    variants.add(url.replace(/&/g, "&amp;"));
    variants.add(url.replace(/%2C/g, "%2c"));
    variants.add(url.replace(/%2C/g, "%2c").replace(/&/g, "&amp;"));
    variants.add(url.replace(/%2c/g, "%2C"));
    variants.add(url.replace(/%2c/g, "%2C").replace(/&/g, "&amp;"));

    const sorted = Array.from(variants).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const v of sorted) {
      if (result.includes(v)) {
        result = result.split(v).join(token);
      }
    }
  });

  const hasDlMap = dlMap && Object.keys(dlMap).length > 0;
  PROMO_BASE_PATTERNS.forEach(({ promoId, regex }) => {
    if (!hasDlMap || dlMap[promoId] !== undefined) {
      result = result.replace(regex, `%%DD_LINK_${promoId}%%`);
    }
  });

  return result;
}

describe("deInterpolateMerchant", () => {
  it("restores {DM Name} when raw dmName is a full name or uppercase but email greeting used formatDmName", () => {
    const merchant = {
      merchantName: "Taco Bell",
      dmName: "JOHN SMITH",
    };
    const html = "<p>Hi John, hope you're doing well!</p><p>We are reaching out regarding Taco Bell.</p>";
    const result = deInterpolateMerchant(html, merchant);

    assert.equal(result, "<p>Hi {DM Name}, hope you're doing well!</p><p>We are reaching out regarding {Store Name}.</p>");
  });

  it("restores {DM Name} when dmName is a normal mixed-case full name", () => {
    const merchant = {
      merchantName: "Burger King",
      dmName: "Sarah Connor",
    };
    const html = "<p>Hi Sarah, here are your marketing options for Burger King.</p>";
    const result = deInterpolateMerchant(html, merchant);

    assert.equal(result, "<p>Hi {DM Name}, here are your marketing options for {Store Name}.</p>");
  });

  it("restores {Store Name} team when DM name is absent and greeting fell back to store team", () => {
    const merchant = {
      merchantName: "Chipotle",
      dmName: "",
    };
    const html = "<p>Hi Chipotle team, hope you are having a great week!</p>";
    const result = deInterpolateMerchant(html, merchant);

    assert.equal(result, "<p>Hi {Store Name} team, hope you are having a great week!</p>");
  });

  it("handles HTML-encoded store names with apostrophes like McDonald's", () => {
    const merchant = {
      merchantName: "McDonald's",
      dmName: "Mike",
    };
    const htmlWithEntity = "<p>Hi Mike, welcome to McDonald&#39;s marketing portal.</p>";
    const result = deInterpolateMerchant(htmlWithEntity, merchant);

    assert.equal(result, "<p>Hi {DM Name}, welcome to {Store Name} marketing portal.</p>");
  });
});

describe("deInjectDeepLinks", () => {
  it("replaces deep links even with %2C or &amp; URL variations", () => {
    const dlMap = {
      ads: "https://www.doordash.com/merchant/manage/campaigns?sids=101%2C102&business_id=biz_1",
    };
    const html = '<a href="https://www.doordash.com/merchant/manage/campaigns?sids=101%2C102&amp;business_id=biz_1">Activate Ads</a>';
    const result = deInjectDeepLinks(html, dlMap);

    assert.equal(result, '<a href="%%DD_LINK_ads%%">Activate Ads</a>');
  });

  it("handles lowercase percent-encoding %2c", () => {
    const dlMap = {
      ads: "https://www.doordash.com/merchant/manage/campaigns?sids=101%2C102&business_id=biz_1",
    };
    const html = '<a href="https://www.doordash.com/merchant/manage/campaigns?sids=101%2c102&business_id=biz_1">Activate Ads</a>';
    const result = deInjectDeepLinks(html, dlMap);

    assert.equal(result, '<a href="%%DD_LINK_ads%%">Activate Ads</a>');
  });

  it("auto-heals stale DoorDash campaign URLs (e.g. old $98 default or old timestamp) back to tokens", () => {
    const dlMap = {
      ads: "https://www.doordash.com/merchant/marketing/sl/create?business_id=12345&aud=all&dsd=9999999999999&sids=111&assisted_rep_id=rep99&abv=2100&abwv=15000&bsao=0&bscv=500&bsia=true&sch_ad=true",
    };
    // HTML contains an old link with empty budget or old $98 default (abv=1400) and different dsd
    const staleHtml = '<p>Check out our offer</p><a href="https://www.doordash.com/merchant/marketing/sl/create?business_id=12345&amp;aud=all&amp;dsd=1111111111111&amp;sids=111&amp;assisted_rep_id=rep99&amp;abv=1400&amp;abwv=9800&amp;bsao=0&amp;bscv=500&amp;bsia=true&amp;sch_ad=true">Activate Ads</a>';
    const result = deInjectDeepLinks(staleHtml, dlMap);

    assert.equal(result, '<p>Check out our offer</p><a href="%%DD_LINK_ads%%">Activate Ads</a>');
  });
});

describe("generateDeepLink budget sanitization", () => {
  it("sanitizes weeklyBudget string with currency symbol ($150) and produces abwv=15000 and abv=2100", () => {
    const url = generateDeepLink({
      businessId: "12345",
      sidsArray: ["111"],
      repId: "rep99",
      weeklyBudget: "$150",
      audienceKey: "all",
    });
    assert.match(url, /abv=2100/);
    assert.match(url, /abwv=15000/);
  });
});
