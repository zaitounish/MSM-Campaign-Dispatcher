/**
 * emailBlockEngine.js
 *
 * Block-based email composition engine.
 * Replaces the raw-HTML-string model in emailTemplates.js with a typed
 * block array that powers the modular email editor.
 *
 * Block types:
 *   TEXT      - Free-form rich text (editable via BlockTextEditor)
 *   PROMO     - Promo section: title, body, CTA button
 *   CREDIT    - Green credit callout banner
 *   CTA       - Closing paragraph
 *   SIGNATURE - Rep sign-off (always locked as the final block)
 *
 * Themes: "momentum" | "executive" | "spotlight"
 *
 * Outlook compatibility: <ul>/<ol> are compiled to <table>-based HTML
 * automatically | the editor keeps native list elements internally.
 *
 * ─── DEEP LINK TOKEN SYSTEM ───────────────────────────────────────────────────
 * CTA button hrefs are written as stable placeholder tokens:
 *   %%DD_LINK_<PROMOID>%%
 * The final per-merchant HTML is produced by injectDeepLinks(), which
 * replaces each token with the correct per-merchant URL at render time.
 * This completely eliminates the "Nature Valley bug" where Merchant A's
 * timestamped deep link URL was regex-matched against Merchant B's HTML
 * (which had a different dsd= timestamp and thus never matched).
 */

import { PROMO_CATALOG } from "../components/PromoSelector";

// ─── Token helpers ─────────────────────────────────────────────────────────────
/** Returns the stable placeholder token for a given promoId */
export const deepLinkToken = (promoId) => `%%DD_LINK_${promoId}%%`;

/**
 * Replaces all deep-link tokens in an HTML string with real URLs from dlMap.
 * Falls back to "#" for any token whose promoId has no URL.
 *
 * @param {string} html    - HTML containing %%DD_LINK_<promoId>%% tokens
 * @param {object} dlMap   - { [promoId]: urlString } for the current merchant
 * @returns {string}
 */
export const injectDeepLinks = (html, dlMap = {}) => {
  if (!html) return "";
  return html.replace(/%%DD_LINK_([^%]+)%%/g, (_, promoId) => {
    const url = dlMap[promoId];
    return url ? url.replace(/&/g, "&amp;") : "#";
  });
};

/**
 * Strips deep-link tokens from HTML, replacing them with "#".
 * Used for preview/edit contexts where no real URL is needed yet.
 */
export const stripDeepLinkTokens = (html) => {
  if (!html) return "";
  return html.replace(/%%DD_LINK_[^%]+%%/g, "#");
};

/**
 * Reverses injectDeepLinks: replaces real deep-link URLs back to %%DD_LINK_promoId%% tokens.
 *
 * This is the fail-safe used at "Apply to All" save time. Even when the editor is
 * displaying a specific merchant's resolved URLs (business_id=XXXXX etc.), this
 * converts them back to stable tokens so every other merchant gets their own URLs
 * when injectDeepLinks() runs in App.jsx's emailDrafts memo.
 *
 * Both raw URL form and HTML-entity-encoded form (&amp;) are replaced.
 *
 * @param {string} html   - HTML potentially containing real deep-link URLs
 * @param {object} dlMap  - { [promoId]: urlString } for the CURRENT merchant
 * @returns {string} HTML with real URLs replaced by %%DD_LINK_promoId%% tokens
 */
export const deInjectDeepLinks = (html, dlMap = {}) => {
  if (!html) return "";
  let result = html;
  Object.entries(dlMap).forEach(([promoId, url]) => {
    if (!url) return;
    const token = deepLinkToken(promoId);
    // Replace the HTML-encoded form first (&amp;), then the raw form
    const encoded = url.replace(/&/g, "&amp;");
    if (encoded !== url) result = result.split(encoded).join(token);
    result = result.split(url).join(token);
  });
  return result;
};

// ─── Block type enum ───────────────────────────────────────────────────────────
export const BLOCK_TYPES = {
  TEXT: "text",
  PROMO: "promo",
  CREDIT: "credit",
  CTA: "cta",
  DIVIDER: "divider",
  SIGNATURE: "signature",
};

// ─── Convenience block factories ───────────────────────────────────────────────
export const createTextBlock = (html = "<p>Type your text here…</p>") =>
  createBlock(BLOCK_TYPES.TEXT, { label: "Custom Text", html });
export const createDividerBlock = () =>
  createBlock(BLOCK_TYPES.DIVIDER, {});

// ─── Theme registry ────────────────────────────────────────────────────────────
export const THEMES = {
  momentum: {
    id: "momentum",
    label: "Momentum",
    icon: "🚀",
    description: "Bold DoorDash red | ideal for multi-promo outreach",
  },
  executive: {
    id: "executive",
    label: "Executive",
    icon: "💼",
    description: "Professional slate | for senior stakeholders & VPs",
  },
  spotlight: {
    id: "spotlight",
    label: "Spotlight",
    icon: "✨",
    description: "Hero-first layout | for single-campaign focus",
  },
};

// ─── Block factory ─────────────────────────────────────────────────────────────
let _seq = 0;
export const createBlock = (type, data = {}) => ({
  id: `blk_${Date.now()}_${++_seq}`,
  type,
  locked: type === BLOCK_TYPES.SIGNATURE,
  data: { ...data },
});

// ─── Promo catalog helpers ─────────────────────────────────────────────────────
const getPromoInfo = (promoId) => {
  for (const cat of PROMO_CATALOG) {
    const p = cat.items.find(i => i.id === promoId);
    if (p) return p;
  }
  return null;
};

const buildPromoBody = (promoId, config) => {
  switch (promoId) {
    case "smart_campaign":
      return "A personalized campaign where DoorDash automatically adjusts discounts in real-time to maximize your ROI.";
    case "ads": {
      let aud = "all DoorDash customers";
      if (config.audience === "new_to_merchant") aud = "entirely new customers";
      else if (config.audience === "existing_consumers_to_merchant") aud = "your existing customers";
      else if (config.audience === "churned_users") aud = "lapsed customers";
      return `A targeted ad campaign to reach ${aud}. ${config.budget ? `With a suggested weekly budget of $${config.budget}, y` : "Y"}ou'll be featured prominently on the app homepage.`;
    }
    case "bogo":
      return `A promotional "Buy 1, Get 1 Free" offer${config.conditionItem ? ` on your ${config.conditionItem}` : ""}. Customers receive ${config.freeItem ? `a free ${config.freeItem}` : "a free item"} when they purchase the required item.`;
    case "delivery_fee":
      return "Differentiate your restaurant by covering your customers' delivery fees, significantly increasing conversion rates.";
    case "discount": {
      const base = config.discountAmount ? `A $${config.discountAmount} off discount` : "A custom discount promotion";
      const min = config.minOrder ? ` on orders over $${config.minOrder}` : "";
      let aud = "all customers";
      if (config.audience === "new_to_merchant") aud = "new customers";
      if (config.audience === "existing_consumers_to_merchant") aud = "existing and lapsed customers";
      if (config.audience === "churned_users") aud = "churned customers";
      return `${base}${min} specifically targeting ${aud} to drive high-value orders.`;
    }
    case "happy_hour": {
      const t = (config.startTime && config.endTime) ? ` running from ${config.startTime} to ${config.endTime}` : "";
      return `A Happy Hour promotion${t}, offering ${config.discountAmount ? `$${config.discountAmount} off` : "a discount"} to drive traffic during slower afternoon hours.`;
    }
    case "lunch_specials": {
      const t = (config.startTime && config.endTime) ? ` running from ${config.startTime} to ${config.endTime}` : "";
      return `A Lunch Special promotion${t}, offering ${config.discountAmount ? `$${config.discountAmount} off` : "a discount"} to capture the midday rush.`;
    }
    case "loyalty":
      return `A digital loyalty punch card. Customers earn ${config.rewardAmount ? `$${config.rewardAmount}` : "a reward"} after completing ${config.spendThreshold ? `$${config.spendThreshold}` : "a set amount"} in purchases, turning first-time diners into regulars.`;
    default:
      return "A specialized campaign to help boost your sales and visibility on DoorDash.";
  }
};

// ─── Initial block generator ───────────────────────────────────────────────────
/**
 * Generates the starting block array from the rep's promo selections.
 * Called once when entering the deliver phase (or when promos change).
 */
export const generateInitialBlocks = (selectedPromos, promoConfigs, repSettings) => {
  const blocks = [];
  const hasAnyCredits = selectedPromos.some(id => promoConfigs[id]?.hasCredit);

  // 1. Intro text block
  blocks.push(createBlock(BLOCK_TYPES.TEXT, {
    label: "Intro",
    html: `<p>Hi {Store Name} team, hope you're doing well!</p><p>I'm reaching out because I've identified some opportunities to help you grow your business and increase your visibility on DoorDash.</p>`,
  }));

  // 2. Credit banner (conditional)
  if (hasAnyCredits) {
    blocks.push(createBlock(BLOCK_TYPES.CREDIT, {
      body: "You have exclusive DoorDash credits available for your store. This is a perfect time to activate these campaigns risk-free and maximize your return:",
    }));
  }

  // 3. One PROMO block per selected promo
  selectedPromos.forEach(promoId => {
    const info = getPromoInfo(promoId);
    if (!info) return;
    const config = promoConfigs[promoId] || {};
    const hasCredit = config.hasCredit === true;
    const creditLine = hasCredit
      ? `<p style="color:#15803d;font-weight:bold;margin:8px 0 0">💳 Covered by your $${config.creditAmount || "0"} risk-free trial credit!</p>`
      : "";

    blocks.push(createBlock(BLOCK_TYPES.PROMO, {
      promoId,
      title: info.name,
      body: `<p>${buildPromoBody(promoId, config)}</p>${creditLine}`,
      buttonText: `Activate ${info.name} →`,
      customUrl: null, // null = use token → resolved at compile time per merchant
    }));
  });

  // 4. Closing CTA
  blocks.push(createBlock(BLOCK_TYPES.CTA, {
    label: "Closing",
    html: "<p>Ready to get started? Click the activation links above to launch your campaigns immediately.</p>",
  }));

  // 5. Signature (locked, always last)
  blocks.push(createBlock(BLOCK_TYPES.SIGNATURE, { repSettings }));

  return blocks;
};

// ─── Subject line builder ──────────────────────────────────────────────────────
export const buildEmailSubject = (merchant, selectedPromos) => {
  // Apply token interpolation to any override before returning
  if (merchant.subjectOverride) return _interpolate(merchant.subjectOverride, merchant);
  const mName = merchant.merchantName || "Merchant Partner";
  if (selectedPromos.length === 1) {
    const p = getPromoInfo(selectedPromos[0]);
    if (p) return `${mName} | Boost Sales with ${p.name} on DoorDash 🚀`;
  }
  if (selectedPromos.length > 1 && selectedPromos.length < 4) {
    return `${mName} | ${selectedPromos.length} Growth Opportunities Waiting For You on DoorDash`;
  }
  return `${mName} | Your Personalized DoorDash Growth Plan`;
};

// ─── Variable interpolation ────────────────────────────────────────────────────
const _interpolate = (html, merchant) => {
  if (!html) return "";
  return html
    .replace(/\{Store\s*Name\}/gi, merchant?.merchantName || "Merchant Partner")
    .replace(/\{DM\s*Name\}/gi, merchant?.dmName || merchant?.merchantName || "there");
};

// ─── Resolve deep link for a PROMO block ──────────────────────────────────────
// Returns a token instead of a live URL. Live URL injection happens in
// injectDeepLinks() at render time, keyed per merchant.
const _resolveUrl = (block) => {
  // If rep manually set a custom URL in the block editor, use it verbatim
  if (block.data.customUrl) return block.data.customUrl;
  // Otherwise return a stable token | resolved per merchant at compile time
  const id = block.data.promoId;
  return id ? deepLinkToken(id) : "#";
};

// ─── Outlook list compatibility ────────────────────────────────────────────────
// Converts <ul>/<ol> to <table>-based HTML so Outlook 2016/2019 renders lists.
const _outlookLists = (html) => {
  if (!html) return "";
  return html
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
      const rows = [...content.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map(([, item]) =>
          `<tr><td style="width:12px;vertical-align:top;padding:1px 6px 1px 0;font-family:sans-serif">•</td>` +
          `<td style="padding:1px 0;font-family:sans-serif">${item.trim()}</td></tr>`
        ).join("");
      return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0">${rows}</table>`;
    })
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
      let n = 0;
      const rows = [...content.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map(([, item]) =>
          `<tr><td style="width:18px;vertical-align:top;padding:1px 6px 1px 0;font-family:sans-serif">${++n}.</td>` +
          `<td style="padding:1px 0;font-family:sans-serif">${item.trim()}</td></tr>`
        ).join("");
      return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0">${rows}</table>`;
    });
};

// ─── Plain-text conversion (exported for raw-HTML override saves) ─────────────
export const htmlToPlainText = (html) => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "• $1\n")
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const _toPlainText = htmlToPlainText;

// ─── Per-block HTML renderers (per theme) ──────────────────────────────────────

const _renderSignatureHtml = (block) => {
  const { firstName = "", lastName = "", title = "Merchant Success", phone = "" } = block.data.repSettings || {};
  const name = [firstName, lastName].filter(Boolean).join(" ") || "DoorDash Merchant Success";
  return `<p style="font-family:sans-serif;font-size:14px;color:#333;margin-top:28px">` +
    `Best regards,<br><strong>${name}</strong><br>${title}` +
    `${phone ? `<br>${phone}` : ""}<br>DoorDash Merchant Success</p>`;
};

const _renderCreditHtml = (block) =>
  `<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;margin:20px 0;font-family:sans-serif">` +
  `<h4 style="margin:0 0 8px;color:#166534;font-size:16px">💳 Unlock Exclusive DoorDash Credits</h4>` +
  `<p style="margin:0;color:#15803d;font-size:14px">${block.data.body || ""}</p></div>`;

// Momentum theme renderers
const _momentumPromo = (block, url) =>
  `<div style="margin:24px 0;padding-top:20px;border-top:1px solid #f0f0f0;font-family:sans-serif">` +
  `<p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#eb1700;text-transform:uppercase;letter-spacing:1.5px;font-family:Helvetica,Arial,sans-serif">Campaign Opportunity</p>` +
  `<h3 style="margin:0 0 10px;color:#1e293b;font-size:16px;font-weight:700;font-family:Helvetica,Arial,sans-serif">${block.data.title}</h3>` +
  `<div style="margin:0 0 16px;font-size:14px;color:#444;line-height:1.6">${_outlookLists(block.data.body)}</div>` +
  `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0"><tr>` +
  `<td style="background:#eb1700;border-radius:6px;padding:10px 22px">` +
  `<a href="${url}" style="color:white;text-decoration:none;font-weight:bold;font-size:14px;font-family:sans-serif;display:block;white-space:nowrap">${block.data.buttonText}</a>` +
  `</td></tr></table></div>`;

// Executive theme renderers
const _executivePromo = (block, url, idx) =>
  `<div style="margin:28px 0;padding:20px;border:1px solid #e2e8f0;border-radius:8px;font-family:sans-serif">` +
  `<p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:.05em">` +
  `Opportunity ${idx + 1}</p>` +
  `<h3 style="margin:0 0 12px;color:#1e293b;font-size:17px">${block.data.title}</h3>` +
  `<div style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6">${_outlookLists(block.data.body)}</div>` +
  `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0"><tr>` +
  `<td style="border:2px solid #1e293b;border-radius:6px;padding:9px 20px">` +
  `<a href="${url}" style="color:#1e293b;text-decoration:none;font-weight:bold;font-size:14px;font-family:sans-serif;display:block;white-space:nowrap">${block.data.buttonText}</a>` +
  `</td></tr></table></div>`;

// Spotlight theme renderers
const _spotlightPromo = (block, url, isFirst) =>
  isFirst
    ? `<div style="background:#0f172a;padding:32px;margin:0 0 24px;border-radius:8px;font-family:sans-serif">` +
    `<p style="margin:0 0 8px;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Featured Campaign</p>` +
    `<h2 style="margin:0 0 16px;color:white;font-size:24px">${block.data.title}</h2>` +
    `<div style="margin:0 0 24px;font-size:15px;color:#cbd5e1;line-height:1.6">${_outlookLists(block.data.body)}</div>` +
    `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%"><tr>` +
    `<td style="background:#eb1700;border-radius:8px;padding:14px 24px;text-align:center">` +
    `<a href="${url}" style="color:white;text-decoration:none;font-weight:bold;font-size:16px;font-family:sans-serif;display:block">${block.data.buttonText}</a>` +
    `</td></tr></table></div>`
    : _momentumPromo(block, url); // secondary promos use momentum style

// ─── Main compilers ────────────────────────────────────────────────────────────

/**
 * Compiles a block array → final HTML for email dispatch.
 *
 * IMPORTANT: The output HTML contains %%DD_LINK_<promoId>%% tokens for CTA
 * buttons. Call injectDeepLinks(html, dlMap) afterwards to resolve them
 * per-merchant. This is handled by compileBlocksToHtml's dlMap parameter
 * AND by App.jsx's emailDrafts memo for the globalHtmlTemplate path.
 *
 * @param {object[]} blocks
 * @param {object}   deepLinks   { [promoId]: urlString } | may be empty for editor preview
 * @param {object}   merchant
 * @param {string}   themeId     "momentum" | "executive" | "spotlight"
 * @returns {string} compiled HTML with deep links resolved
 */
export const compileBlocksToHtml = (blocks, deepLinks, merchant, themeId = "momentum", skipInject = false) => {
  let promoIndex = 0;
  const tokenHtml = blocks.map(block => {
    switch (block.type) {
      case BLOCK_TYPES.TEXT:
      case BLOCK_TYPES.CTA:
        return `<div style="font-family:sans-serif;font-size:14px;color:#333;line-height:1.6;margin:0 0 8px">` +
          _outlookLists(_interpolate(block.data.html, merchant)) + `</div>`;

      case BLOCK_TYPES.CREDIT:
        return _renderCreditHtml(block);

      case BLOCK_TYPES.PROMO: {
        // _resolveUrl returns the stable token (%%DD_LINK_ads%% etc.)
        const token = _resolveUrl(block);
        const body = { ...block, data: { ...block.data, body: _interpolate(block.data.body, merchant) } };
        let html;
        if (themeId === "executive") {
          html = _executivePromo(body, token, promoIndex);
        } else if (themeId === "spotlight") {
          html = _spotlightPromo(body, token, promoIndex === 0);
        } else {
          html = _momentumPromo(body, token);
        }
        promoIndex++;
        return html;
      }

      case BLOCK_TYPES.DIVIDER:
        return `<hr style="border:none;border-top:1px solid #eee;margin:20px 0">`;

      case BLOCK_TYPES.SIGNATURE:
        return _renderSignatureHtml(block);

      default:
        return "";
    }
  }).join("\n");

  // skipInject = true → return raw token HTML for use as a global template
  // (%%DD_LINK_xxx%% tokens stay intact so each merchant gets their own URLs later)
  return skipInject ? tokenHtml : injectDeepLinks(tokenHtml, deepLinks);
};

/**
 * Compiles a block array → plain text for mailto: dispatch.
 * Lists are converted to "• item" and "1. item" format.
 * @param {object[]} blocks
 * @param {object}   deepLinks
 * @param {object}   merchant
 * @returns {string} plain text body
 */
export const compileBlocksToText = (blocks, deepLinks, merchant) => {
  return blocks.map(block => {
    switch (block.type) {
      case BLOCK_TYPES.TEXT:
      case BLOCK_TYPES.CTA:
        return _toPlainText(_interpolate(block.data.html, merchant));

      case BLOCK_TYPES.CREDIT:
        return `💳 UNLOCK EXCLUSIVE DOORDASH CREDITS\n${block.data.body || ""}\n`;

      case BLOCK_TYPES.PROMO: {
        const promoId = block.data.promoId;
        const url = (promoId && deepLinks?.[promoId]) ? deepLinks[promoId] : "#";
        const body = _toPlainText(_interpolate(block.data.body, merchant));
        return `━━━ 🚀 ${block.data.title} ━━━\n${body}\n→ ${block.data.buttonText}: ${url}\n`;
      }

      case BLOCK_TYPES.SIGNATURE: {
        const { firstName = "", lastName = "", title = "Merchant Success", phone = "" } = block.data.repSettings || {};
        const name = [firstName, lastName].filter(Boolean).join(" ") || "DoorDash Merchant Success";
        return `\nBest regards,\n${name}\n${title}${phone ? `\n${phone}` : ""}\nDoorDash Merchant Success`;
      }

      case BLOCK_TYPES.DIVIDER:
        return "────────────────";

      default:
        return "";
    }
  }).filter(Boolean).join("\n\n");
};

// ─── Block move helper (used by EmailBlockEditor) ─────────────────────────────
export const moveBlock = (blocks, id, direction) => {
  const idx = blocks.findIndex(b => b.id === id);
  if (idx === -1) return blocks;
  const newIdx = direction === "up" ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= blocks.length) return blocks;
  if (blocks[newIdx]?.locked) return blocks;
  if (blocks[idx]?.locked) return blocks;
  const next = [...blocks];
  [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
  return next;
};

// ─── Rich email wrapper ────────────────────────────────────────────────────────
// Wraps compiled block HTML in a premium DoorDash-branded email container.
// Used for "Rich" mode preview and GAS-created Gmail drafts.
export const wrapForRichEmail = (bodyHtml) => {
  const year = new Date().getFullYear();
  return (
    `<div style="margin:0;padding:0;background:#f1f5f9">` +
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px"><tr><td align="center">` +
    `<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">` +
    `<tr><td style="background:#eb1700;border-radius:12px 12px 0 0;padding:26px 32px">` +
    `<p style="margin:0;color:#fff;font-size:22px;font-weight:800;font-family:Helvetica,Arial,sans-serif;letter-spacing:-0.5px">DoorDash</p>` +
    `<p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:11px;font-family:Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:1.5px">Merchant Success</p>` +
    `</td></tr>` +
    `<tr><td style="background:#ffffff;padding:36px 32px 8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">` +
    bodyHtml +
    `</td></tr>` +
    `<tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:18px 32px;text-align:center">` +
    `<p style="margin:0;font-size:11px;color:#94a3b8;font-family:Helvetica,Arial,sans-serif">DoorDash Merchant Success</p>` +
    `<p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;font-family:Helvetica,Arial,sans-serif">&copy; ${year} DoorDash, Inc.</p>` +
    `</td></tr>` +
    `</table></td></tr></table></div>`
  );
};

// ─── Clean (personal) email compiler ──────────────────────────────────────────
// Looks like a professional email written in Gmail — no banners, no heavy
// backgrounds, structured prose with in-text hyperlinks and a simple signature.
export const compileBlocksToCleanHtml = (blocks, deepLinks, merchant) => {
  const ff = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const parts = [];

  blocks.forEach(block => {
    switch (block.type) {
      case BLOCK_TYPES.TEXT:
      case BLOCK_TYPES.CTA: {
        const html = _outlookLists(_interpolate(block.data.html, merchant));
        parts.push(`<div style="margin:0 0 16px;font-size:14px;color:#1a1a1a;line-height:1.75;${ff}">${html}</div>`);
        break;
      }
      case BLOCK_TYPES.CREDIT:
        parts.push(
          `<p style="margin:18px 0;padding:10px 14px;background:#f0fdf4;border-left:3px solid #22c55e;font-size:14px;color:#166534;line-height:1.65;${ff}">` +
          `<strong>Credits Available:</strong> ${block.data.body || ""}</p>`
        );
        break;
      case BLOCK_TYPES.PROMO: {
        const promoId = block.data.promoId;
        const rawUrl  = block.data.customUrl || (promoId ? deepLinkToken(promoId) : "#");
        const url     = (deepLinks && promoId && deepLinks[promoId]) ? deepLinks[promoId] : rawUrl;
        const href    = (url && !url.startsWith("%%")) ? url : "#";
        const body    = _outlookLists(_interpolate(block.data.body, merchant));
        parts.push(
          `<div style="margin:22px 0">` +
          `<p style="margin:0 0 6px;${ff}"><strong style="font-size:15px;color:#1a1a1a">${block.data.title}</strong></p>` +
          `<div style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.75;${ff}">${body}</div>` +
          `<a href="${href}" style="color:#1155cc;text-decoration:underline;font-size:13px;${ff}">${block.data.buttonText}</a>` +
          `</div>`
        );
        break;
      }
      case BLOCK_TYPES.SIGNATURE: {
        const { firstName = "", lastName = "", title = "Merchant Success", phone = "" } = block.data.repSettings || {};
        const name = [firstName, lastName].filter(Boolean).join(" ") || "DoorDash Merchant Success";
        parts.push(
          `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:14px;color:#1a1a1a;line-height:1.8;${ff}">` +
          `Best regards,<br><strong style="font-size:15px">${name}</strong><br>` +
          `<span style="color:#6b7280">${title}${phone ? ` &middot; ${phone}` : ""}</span><br>` +
          `<span style="color:#6b7280">DoorDash Merchant Success</span></div>`
        );
        break;
      }
      case BLOCK_TYPES.DIVIDER:
        parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0">`);
        break;
      default: break;
    }
  });

  return injectDeepLinks(parts.join("\n"), deepLinks);
};

