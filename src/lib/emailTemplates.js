import { PROMO_CATALOG } from "../components/PromoSelector";

const getPromoInfo = (promoId) => {
  for (const cat of PROMO_CATALOG) {
    const p = cat.items.find(i => i.id === promoId);
    if (p) return p;
  }
  return null;
};

const buildPromoSummary = (promoId, config) => {
  switch (promoId) {
    case "smart_campaign":
      return "A personalized campaign where DoorDash automatically adjusts discounts in real-time to maximize your ROI.";
    case "ads_all":
      return `A targeted ad campaign to reach all DoorDash customers. ${config.budget ? `With a suggested weekly budget of $${config.budget}, ` : ""}You'll be featured prominently on the app homepage.`;
    case "ads_new":
      return `An acquisition ad campaign precisely targeting entirely new customers. ${config.budget ? `With a suggested weekly budget of $${config.budget}, ` : ""}This is the best way to bring net-new diners to your store.`;
    case "bogo":
      return `A promotional "Buy 1, Get 1 Free" offer${config.conditionItem ? ` on your ${config.conditionItem}` : ""}. Customers receive ${config.freeItem ? `a free ${config.freeItem}` : "a free item"} when they purchase the required item.`;
    case "delivery_fee":
      return "Differentiate your restaurant by covering your customers' delivery fees, significantly increasing conversion rates.";
    case "discount": {
      const parts = [];
      if (config.discountAmount) parts.push(`A $${config.discountAmount} off discount`);
      else parts.push("A custom discount promotion");
      if (config.minOrder) parts.push(`on orders over $${config.minOrder}`);
      let aud = "all customers";
      if (config.audience === "new_to_merchant") aud = "new customers";
      if (config.audience === "existing_consumers_to_merchant") aud = "existing and lapsed customers";
      if (config.audience === "churned_users") aud = "churned customers";
      return `${parts.join(" ")} specifically targeting ${aud} to drive high-value orders.`;
    }
    case "happy_hour": {
      const timeTag = (config.startTime && config.endTime) ? ` running from ${config.startTime} to ${config.endTime}` : "";
      return `A Happy Hour promotion${timeTag}, offering ${config.discountAmount ? `$${config.discountAmount} off` : "a discount"} to drive traffic during slower afternoon hours.`;
    }
    case "lunch_specials": {
      const timeTag = (config.startTime && config.endTime) ? ` running from ${config.startTime} to ${config.endTime}` : "";
      return `A Lunch Special promotion${timeTag}, offering ${config.discountAmount ? `$${config.discountAmount} off` : "a discount"} to capture the midday rush.`;
    }
    case "loyalty":
      return `A digital loyalty punch card. Customers earn ${config.rewardAmount ? `$${config.rewardAmount}` : "a reward"} after completing ${config.spendThreshold ? `$${config.spendThreshold}` : "a set amount"} in purchases, turning first-time diners into regulars.`;
    default:
      return "A specialized campaign to help boost your sales and visibility on DoorDash.";
  }
};

export const generateEmail = ({ merchant, selectedPromos, promoConfigs, repSettings, deepLinks }) => {
  try {
  // If merchant has a custom override, just wrap that.
  let isCustom = !!merchant.emailOverride;

  const mName = merchant.merchantName || "Merchant Partner";
  
  // Subject - use rep's override if set, otherwise auto-generate
  let subject = merchant.subjectOverride || "";
  if (!subject) {
    if (selectedPromos.length === 1) {
      const p1 = getPromoInfo(selectedPromos[0]);
      if (p1) subject = `${mName} | Boost Sales with ${p1.name} on DoorDash \ud83d\ude80`;
    } else if (selectedPromos.length > 1 && selectedPromos.length < 4) {
      subject = `${mName} | ${selectedPromos.length} Growth Opportunities Waiting For You on DoorDash`;
    } else {
      subject = `${mName} | Your Personalized DoorDash Growth Plan`;
    }
  }

  // --- Signature Block ---
  const { firstName = "", lastName = "", title = "Merchant Success", phone = "" } = repSettings;
  const sigText = `\n\nBest regards,\n${firstName} ${lastName}\n${title}\n${phone ? `${phone}\n` : ""}DoorDash Merchant Success`;
  const sigHtml = `<br><br>Best regards,<br><strong>${firstName} ${lastName}</strong><br>${title}<br>${phone ? `${phone}<br>` : ""}DoorDash Merchant Success`;

  // Provide exactly what the user wrote if override exists
  if (isCustom) {
    return {
      subject,
      htmlBody: merchant.emailOverride,
      plainTextBody: merchant.emailOverride.replace(/<[^>]*>?/gm, ''),
      isCustom: true
    };
  }

  // --- HTML Builder ---
  let html = `<p style="font-family: sans-serif; font-size: 14px; color: #333;">Hi ${mName} team, hope you're doing well!</p>`;
  html += `<p style="font-family: sans-serif; font-size: 14px; color: #333;">I'm reaching out because I've identified some opportunities to help you grow your business and increase your visibility on DoorDash.</p>`;

  const hasAnyCredits = selectedPromos.some(id => promoConfigs[id]?.hasCredit);

  if (hasAnyCredits) {
    html += `
    <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; font-family: sans-serif;">
      <h4 style="margin: 0 0 8px 0; color: #166534; font-size: 16px;">💳 Unlock Exclusive DoorDash Credits</h4>
      <p style="margin: 0; color: #15803d; font-size: 14px;">
        You have exclusive DoorDash credits available for your store. This is a perfect time to activate these campaigns risk-free and maximize your return:
      </p>
    </div>
    `;
  }

  // --- Text Builder ---
  let text = `Hi ${mName} team, hope you're doing well!\n\nI'm reaching out because I've identified some opportunities to help you grow your business and increase your visibility on DoorDash.\n\n`;
  if (hasAnyCredits) {
    text += `💳 UNLOCK EXCLUSIVE DOORDASH CREDITS\nYou have exclusive DoorDash credits available for your store. This is a perfect time to activate these campaigns risk-free and maximize your return:\n\n`;
  }

  selectedPromos.forEach((promoId) => {
    const promoInfo = getPromoInfo(promoId);
    // Guard: skip if this promo ID is somehow not in the catalog
    if (!promoInfo) return;
    const config = promoConfigs[promoId] || {};
    const link = (deepLinks && deepLinks[promoId]) ? deepLinks[promoId] : "#";
    
    const hasPromoCredit = config.hasCredit === true;

    html += `
    <div style="margin: 24px 0; padding-top: 16px; border-top: 1px solid #eee; font-family: sans-serif;">
      <h3 style="margin: 0 0 12px 0; color: #eb1700;">━━━ 🚀 ${promoInfo.name} ━━━</h3>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #444; line-height: 1.5;">
        ${buildPromoSummary(promoId, config)}
        ${hasPromoCredit ? `<br><br><span style="color: #15803d; font-weight: bold;">💳 Covered by your $${config.creditAmount || "0"} risk-free trial credit!</span>` : ""}
      </p>
      <a href="${link}" style="display: inline-block; background-color: #eb1700; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
        Activate ${promoInfo.name} →
      </a>
    </div>
    `;

    text += `━━━ 🚀 ${promoInfo.name} ━━━\n`;
    text += `${buildPromoSummary(promoId, config)}\n`;
    if (hasPromoCredit) text += `💳 Covered by your $${config.creditAmount || "0"} risk-free trial credit!\n`;
    text += `\n→ Activate Here: ${link}\n\n`;
  });

  html += `<p style="font-family: sans-serif; font-size: 14px; color: #333; margin-top: 30px;">Ready to get started? Click the activation links above to launch your campaigns immediately.</p>`;
  html += `<p style="font-family: sans-serif; font-size: 14px; color: #333;">${sigHtml}</p>`;

  text += `Ready to get started? Click the activation links above to launch your campaigns immediately.`;
  text += sigText;

  return { subject, htmlBody: html, plainTextBody: text, isCustom: false };
  } catch (err) {
    console.error("[generateEmail] crashed for merchant:", merchant?.merchantName, err);
    return {
      subject: `${merchant?.merchantName || "Merchant"} | DoorDash Campaign`,
      htmlBody: `<p style="font-family:sans-serif;color:#333">Email generation encountered an error. Please review your promo configuration.</p>`,
      plainTextBody: "Email generation encountered an error. Please review your promo configuration.",
      isCustom: false
    };
  }
};
