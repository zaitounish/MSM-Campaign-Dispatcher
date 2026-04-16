# MSM Campaign Dispatcher - Implementation Plan (FINAL)

## Overview

A standalone, **client-side React + Tailwind CSS** web application for Merchant Success reps.
Reps upload their BOB, select promos, configure financial parameters, optionally note merchant credits,
then dispatch personalized deep-linked emails via Google Apps Script (bulk) or `mailto:` (fallback).

**Target directory:** `D:\DoorDash\Merchant Promo & Email Bulk Sender\MSM Campaign Dispatcher\`
**Stack:** Vite + React + Tailwind CSS + `xlsx` (CDN) + Lucide React

---

## Proposed File Structure

```
MSM Campaign Dispatcher/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── gas/
│   └── Code.gs                  # Google Apps Script companion (bulk send backend)
└── src/
    ├── main.jsx
    ├── App.jsx                   # Root orchestrator - all global state lives here
    ├── config.js                 # Constants: BASE_DEEP_LINK_URL, static param defaults
    ├── lib/
    │   ├── bobParser.js          # BOB extraction + deduplication engine
    │   ├── deepLinkBuilder.js    # URL construction with param encoding
    │   └── emailTemplates.js     # Subject + HTML body + plain text generator
    └── components/
        ├── Header.jsx
        ├── StepIndicator.jsx     # Phase 1 → 2 → 3 → 4 breadcrumb
        ├── RepSettingsModal.jsx  # localStorage: rep ID, name, title, phone, GAS URL
        ├── UploadZone.jsx
        ├── MerchantTable.jsx
        ├── CreditsPanel.jsx      # NEW: per-merchant credit flag + amount + expiry
        ├── PromoSelector.jsx
        ├── PromoCustomizer.jsx   # Per-promo financial inputs (maps to URL params)
        ├── EmailPreview.jsx
        ├── MerchantEmailEditor.jsx
        └── DeliveryPanel.jsx
```

---

## Phase 0 - Scaffolding

Run inside `MSM Campaign Dispatcher/`:
```bash
npx -y create-vite@latest ./ --template react
npm install tailwindcss @tailwindcss/vite lucide-react
```
No CDN for Tailwind - use the Vite plugin for full JIT.
`xlsx` loaded from CDN via `<script>` in `index.html` (matches the proven pattern from App.jsx baseline).

`tailwind.config.js` extends with:
```js
theme: { extend: { colors: { 'dd-red': '#eb1700', 'dd-red-dark': '#d11500' } } }
```

---

## Phase 1 - Data Ingestion (BOB Parser)

### `src/lib/bobParser.js`

**Column Detection - Fuzzy Keyword Matching**

Headers are normalized: `h.toLowerCase().trim().replace(/\s+/g, ' ')` before matching.

| Target Field | Match Condition |
|---|---|
| `merchantName` | includes `"merchant name"` OR `"store name"` OR `"business name"` |
| `storeId` | includes `"store id"` OR exactly `"sid"` |
| `businessId` | includes `"business id"` OR `"business_id"` |
| `dmEmail` | includes `"dm email"` OR `"decision maker"` |
| `storeEmail` | includes `"store email"` (lower priority than dmEmail) |

**Two-Pass Deduplication Algorithm**

```
Pass 1: Group rows by `businessId` (primary grouping key)
  → Merge all sids from sibling rows into comma-string: "123,456,789"
  → Keep merchantName from the first row in the group
  → targetEmail = first non-empty dmEmail in group, else first non-empty storeEmail

Pass 2: Among rows *without* a businessId, group by dmEmail (fallback key)
  → Same merging logic as Pass 1
```

**Output schema (per merchant target row):**
```js
{
  id: crypto.randomUUID(),
  merchantName: string,
  businessId: string,
  sids: string,           // "123,456" - comma-separated
  targetEmail: string,    // dmEmail ?? storeEmail
  dmEmail: string,
  storeEmail: string,
  locationCount: number,
  selected: boolean,      // default: true
  // Credits (populated by CreditsPanel, default null):
  hasCredits: false,
  creditAmount: "",       // e.g. "50"
  creditExpiry: "",       // e.g. "2025-06-30" (optional)
  emailOverride: null,    // per-merchant body override string
}
```

### `src/components/UploadZone.jsx`

- Drag-and-drop zone (matches Markup Tracker aesthetic: dashed border, red on hover, `UploadCloud` icon)
- Progress overlay modal during parsing ("Reading file… Deduplicating…")
- Post-load banner: `"✓ 47 merchants loaded (12 locations consolidated into 5 franchise groups)"`
- Accepts `.xlsx`, `.xls`, `.csv`

### `src/components/MerchantTable.jsx`

| Column | Notes |
|---|---|
| ☐ | Individual row checkbox |
| Merchant Name | Bold; franchise badge if `locationCount > 1` |
| Business ID | Monospace, muted |
| Store ID(s) | Shows first SID + badge "+N more" if multi |
| Target Email | Shown with DM / Store indicator tag |
| Credits | Small pill badge if `hasCredits` (green $) |
| Actions | "Edit Credits" icon per row |

- Master select-all checkbox in header
- Search bar: filters by merchant name OR email
- Row click expands accordion: all SIDs listed, both emails shown

---

## Phase 2 - Credits Feature

### `src/components/CreditsPanel.jsx`

Rendered as a collapsible section **within each merchant row's expanded accordion** and also accessible via a dedicated "Edit Credits" icon button.

**Per-merchant Credit Input:**
```
☐ This merchant has available DoorDash credits
   ↳ Credit Amount: $[ _____ ]
   ↳ Expiry Date (optional): [ date picker ]
```

- State stored on the merchant object (`hasCredits`, `creditAmount`, `creditExpiry`)
- When `hasCredits = true`, the template engine automatically inserts a **highlighted credits callout block** into the email body:

```
💳 You Have Credits Available!
You currently have $[X] in DoorDash credits [expiring on MM/DD/YYYY].
This is a perfect time to activate your [Promo Name] - your credits can
help offset the initial cost and maximize your return.
```

- Also adds a sentence to the promo section: *"Your available DoorDash credits make this an essentially risk-free opportunity to try."*

---

## Phase 3 - Promo Selector & Customizer

### `src/components/PromoSelector.jsx`

Promo catalog in a 3-column card grid. Two sections matching the MX portal layout:

**Recommended for You:**
- Smart Campaign
- Advertise to All Customers
- Advertise to New Customers
- Buy 1 Get 1 Free
- Pay Customer's Delivery Fee

**More Ways to Help You Grow:**
- Offer a Discount Promotion
- Happy Hour
- Lunch Specials
- Loyalty Program

Cards: white background, `#eb1700` left border + red header when selected, checkmark icon overlay.
Multi-select enabled. Selecting any promo expands the Customizer panel.

### `src/components/PromoCustomizer.jsx`

One accordion section per selected promo. All financial inputs here feed **both** the email template **and** the deep link URL params.

---

#### Complete Promo Config Spec + Deep Link Param Mapping

**Smart Campaign** (`smart_campaign`)
- No user inputs (DoorDash auto-optimizes)
- Deep link static params: `bsia=true`
- `aud`: none

---

**Advertise to All Customers** (`ads_all`)
| UI Field | URL Param | Format |
|---|---|---|
| Weekly Budget | `abv` | Integer (dollars × 100, e.g. $10 → `1000`) |
| - | `aud` | hardcoded `all` |
| - | `bsia=true`, `sch_ad=true`, `bsao=0` | static |

---

**Advertise to New Customers** (`ads_new`)
| UI Field | URL Param | Format |
|---|---|---|
| Weekly Budget | `abv` | Integer (dollars × 100) |
| - | `aud` | hardcoded `new_to_merchant` |
| - | `bsia=true`, `sch_ad=true`, `bsao=0` | static |

---

**Buy 1 Get 1 Free** (`bogo`)
- UI Fields: "Free Item Name", "With Purchase Of" (item name)
- No financial URL params (portal configures item details post-click)
- `aud`: none
- Static: `bsia=true`

---

**Pay Customer's Delivery Fee** (`delivery_fee`)
- No user inputs
- `aud`: none
- Static: `bsia=true`

---

**Offer a Discount** (`discount`)
| UI Field | URL Param | Format | Notes |
|---|---|---|---|
| Discount Amount ($) | `bscv` | Integer (dollars × 100, e.g. $5 → `500`) | |
| Minimum Order ($) | (text only, no param) | - | Optional, email copy only |
| Target Audience | `aud` | See audience map below | |
| - | `bsia=true`, `bsao=0` | static | |

Audience dropdown:
```
● All Customers         → aud=all
○ New Customers         → aud=new_to_merchant
○ Existing Customers    → aud=existing_consumers_to_merchant
○ Churned Customers     → aud=churned_users
```

---

**Happy Hour** (`happy_hour`)
| UI Field | URL Param | Notes |
|---|---|---|
| Start Time (h:mm) | (text only) | Email copy only |
| End Time (h:mm) | (text only) | Email copy only |
| Discount Amount ($) | `bscv` | Integer (× 100) |
| - | `bsia=true`, `bsao=0` | static |
| `aud` | `all` | hardcoded |

---

**Lunch Specials** (`lunch_specials`)
Identical structure to Happy Hour. Default time window hint: "11 am – 2 pm".

---

**Loyalty Program** (`loyalty`)
| UI Field | URL Param | Notes |
|---|---|---|
| Reward Amount ($) | (text only) | Email copy only |
| Spend Threshold ($) | (text only) | Email copy only |
| `aud` | none | |
| Static | `bsia=true` | |

---

**Global Audience Map (locked in):**

| UI Label | `aud` Value |
|---|---|
| All Customers | `all` |
| New Customers | `new_to_merchant` |
| Existing / Lapsed | `existing_consumers_to_merchant` |
| Churned Customers | `churned_users` |

---

## Phase 4 - Deep Link Builder

### `src/lib/deepLinkBuilder.js`

```js
const BASE = "https://www.doordash.com/merchant/marketing/sl/create";

// Static defaults always included
const STATIC_PARAMS = { bsia: "true", bsao: "0" };

function buildDeepLink({ businessId, sids, audience, repId, promoParams = {} }) {
  const p = new URLSearchParams();
  p.set("business_id", businessId);
  p.set("sids", sids);
  if (audience) p.set("aud", audience);
  if (repId) p.set("assisted_rep_id", repId);
  // Dynamic financial params (e.g. abv, bscv) from promoParams
  Object.entries(promoParams).forEach(([k, v]) => { if (v !== "") p.set(k, v); });
  // Static defaults
  Object.entries(STATIC_PARAMS).forEach(([k, v]) => p.set(k, v));
  return `${BASE}?${p.toString()}`;
}
```

**Financial value encoding:**
```js
const toCents = (dollarStr) => Math.round(parseFloat(dollarStr) * 100);
// $5.00 → 500, $10 → 1000
```

Each promo's customizer config feeds this function:
- `discount.amount` → `bscv: toCents(amount)`
- `ads_all.budget` → `abv: toCents(budget)`
- `happy_hour.discount` → `bscv: toCents(discount)`

---

## Phase 5 - Template Engine

### `src/lib/emailTemplates.js`

Pure function signature:
```js
generateEmail({
  merchant,         // { merchantName, sids, businessId, hasCredits, creditAmount, creditExpiry }
  selectedPromos,   // ["ads_new", "loyalty"]
  promoConfigs,     // { ads_new: { budget: "10", audience: "new_to_merchant" }, ... }
  repSettings,      // { repId, firstName, lastName, title, phone }
  deepLinks,        // { [promoId]: "https://doordash.com/merchant/..." }
}) => { subject, htmlBody, plainTextBody }
```

**Subject line logic:**
- 1 promo: `"[MerchantName] - Unlock [PromoName] on DoorDash 🚀"`
- 2–3 promos: `"[MerchantName] - [N] Growth Opportunities on DoorDash"`
- 4+ promos: `"[MerchantName] - Your Personalized DoorDash Growth Plan"`

**HTML body structure:**
```
[Greeting]
Hi [Merchant Name] team, hope you're doing well!

[Credits Block - only if hasCredits=true]
💳 You Have $[X] in DoorDash Credits [expiring MM/DD/YYYY]!
  "This is a great time to activate one of the campaigns below..."

[For each selected promo:]
━━━ [Emoji] [Promo Name] ━━━
  [2–3 sentence pitch incorporating the rep's configured parameters]
  [e.g. "A $5 discount promotion targeting new customers..."]
  → <a href="[deep link]">Activate [Promo Name] →</a>   (HTML version)
  → [Promo Name]: [raw URL]                               (plain text version)

[Signature]
Best regards,
[First Name] [Last Name]
[Title]
[Phone]
DoorDash Merchant Success
```

### `src/components/EmailPreview.jsx`

- Left panel: Live rendered HTML preview (inside sandboxed `<iframe>` or rendered div)
- Right panel: Editable `<textarea>` for the master template
- Merchant navigator: `"← Merchant 3 of 12 →"`
- Badge: "Custom" on merchants with `emailOverride`
- "Edit This Merchant Individually" → opens `MerchantEmailEditor`

### `src/components/MerchantEmailEditor.jsx`

- Modal with merchant name in title
- Pre-filled with their generated `htmlBody`
- "Reset to Template" clears override
- Changes saved to `merchant.emailOverride`

---

## Phase 6 - Settings Modal

### `src/components/RepSettingsModal.jsx`

Persists to `localStorage` key `"mcd_rep_settings"`:

| Field | localStorage key | Used in |
|---|---|---|
| First Name | `firstName` | Email signature |
| Last Name | `lastName` | Email signature |
| Title | `title` | Email signature |
| Phone | `phone` | Email signature |
| Rep ID (`assisted_rep_id`) | `repId` | All deep links |
| GAS Web App URL | `gasUrl` | Bulk Send POST target |

- Modal auto-opens on first launch if `repId` is empty
- Settings icon (`Settings` from lucide-react) in header always accessible

---

## Phase 7 - Delivery Panel

### `src/components/DeliveryPanel.jsx`

Fixed bottom action bar (visible once email drafts are generated).

**"🚀 Bulk Send" (Primary)**
```js
POST gasUrl
Content-Type: application/json
Body: {
  emails: [
    { to: "...", subject: "...", htmlBody: "...", name: "..." },
    ...
  ]
}
```
- Loading spinner during send
- Success toast: `"✓ 12 emails dispatched via DoorDash GAS"`
- Error toast with raw GAS error message

**"📋 Generate Drafts" (Fallback)**
- Generates `mailto:?subject=...&body=...` per merchant (URL-encoded plain text body)
- Opens each with 600ms delay to avoid browser popup blocking
- Counter badge: `"Opening draft 3 of 12..."`

**"📥 Export Summary" (Utility)**
- Downloads `.xlsx` using the CDN `XLSX` library
- Columns: Merchant Name | Target Email | Subject | Deep Link(s) | # Locations | Has Credits

---

## Phase 8 - GAS Companion Script

### `gas/Code.gs`

```javascript
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const emails = payload.emails;

    emails.forEach(function(email) {
      MailApp.sendEmail({
        to: email.to,
        subject: email.subject,
        htmlBody: email.htmlBody,
        name: email.name || "DoorDash Merchant Success"
      });
    });

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", sent: emails.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Required to handle CORS preflight from the browser
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "online" }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**Deployment instructions (to be included as a README comment in the file):**
1. Go to [script.google.com](https://script.google.com), paste this code
2. Deploy → New Deployment → Web App
3. Execute as: **Me** | Who has access: **Anyone**
4. Copy the Web App URL → paste into the "Settings" modal in the React app

---

## Global State Architecture (`App.jsx`)

```js
// Phase gate
const [phase, setPhase] = useState("upload");
// "upload" | "select" | "build" | "deliver"

// Phase 1 data
const [merchants, setMerchants] = useState([]);
// Array of merchant objects (see bobParser output schema)

// Phase 3 data
const [selectedPromos, setSelectedPromos] = useState([]);
const [promoConfigs, setPromoConfigs] = useState({});
// { [promoId]: { audience, budgetDollars, discountDollars, ... } }

// Phase 4 derived data (useMemo)
const deepLinks = useMemo(() =>
  buildAllDeepLinks(merchants, selectedPromos, promoConfigs, repSettings.repId),
  [merchants, selectedPromos, promoConfigs, repSettings]
);

const emailDrafts = useMemo(() =>
  merchants.map(m => generateEmail({ merchant: m, selectedPromos, promoConfigs, repSettings, deepLinks: deepLinks[m.id] })),
  [merchants, selectedPromos, promoConfigs, repSettings, deepLinks]
);

// Settings (hydrated from localStorage on mount)
const [repSettings, setRepSettings] = useState(() =>
  JSON.parse(localStorage.getItem("mcd_rep_settings") || "{}")
);
useEffect(() => {
  localStorage.setItem("mcd_rep_settings", JSON.stringify(repSettings));
}, [repSettings]);
```

---

## Design System (matches MSM Markup Tracker)

| Token | Value |
|---|---|
| Brand Red | `#eb1700` |
| Brand Red Dark | `#d11500` |
| Background | `bg-slate-50` |
| Cards | `bg-white border border-slate-200 rounded-2xl shadow-sm` |
| Font | Inter via Google Fonts |
| Promo card selected | `border-[#eb1700] bg-red-50 ring-1 ring-[#eb1700]` |

---

## Verification Plan

### After Each Phase
| Phase | Verification |
|---|---|
| 0 Scaffold | `npm run dev` → clean Vite dev server |
| 1 Parser | Upload `Ahmed Gad - Accounts (2).xlsx` → verify dedup count, sids merge, email priority |
| 2 Credits | Toggle credits on a merchant → verify email block appears in preview |
| 3 Promo | Select "Discount $5 / New Customers" → verify `bscv=500&aud=new_to_merchant` in deep link |
| 4 Template | Check no `undefined` in any rendered email field |
| 5 Settings | Refresh page → verify `repId` and signature persist |
| 6 Mailto | Click Generate Drafts → verify Outlook/Gmail pre-fills `To`, `Subject`, `Body` |
| 7 GAS | Deploy GAS → click Bulk Send → verify emails arrive in inbox |

---

## Implementation Order (Build Sequence)

```
1. Scaffold (Phase 0)
2. bobParser.js + UploadZone + MerchantTable  (Phase 1)
3. CreditsPanel integrated into MerchantTable  (Phase 2)
4. PromoSelector + PromoCustomizer             (Phase 3)
5. deepLinkBuilder.js                          (Phase 4)
6. emailTemplates.js + EmailPreview + MerchantEmailEditor (Phase 5)
7. RepSettingsModal                            (Phase 6)
8. DeliveryPanel (mailto first, GAS second)    (Phase 7)
9. gas/Code.gs + README                        (Phase 8)
```
