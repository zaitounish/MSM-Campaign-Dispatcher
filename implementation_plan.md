# MSM Campaign Dispatcher | Product Roadmap

> **Goal:** Make the sales process faster and more convenient for both reps and merchants.
> Items are prioritized by impact. Phase 1 can start immediately with no open questions.

---

## 🔴 P0 | Critical (Fix Now)

| # | Feature | Problem | Solution |
|---|---------|---------|---------|
| 1 | **Gmail Paste Reminder** | Rep opens Gmail tab but forgets to Ctrl+V | Show a large, persistent "📋 Press Ctrl+V to paste your email" banner in the queue modal. Cannot be missed. |
| 2 | **Session Persistence** | Refresh = all work lost | Auto-save merchant selections, promo config, and email edits to `localStorage` on every change. Restore on mount. Add a "Clear session" reset button. |

---

## 🟠 P1 | High Value (Phase 2)

| # | Feature | Problem | Solution |
|---|---------|---------|---------|
| 3 | **Merchant Priority Scoring** | Reps scan a flat list with no signal on who to call first | Compute a score from: # locations, days since last campaign, missing email flag. Show 🔴 / 🟡 / ⚪ priority badges. Sortable column. |
| 4 | **Promo Recommendations** | Rep manually decides which promos to pitch per merchant | Auto-recommend promo mix based on merchant category, location count, and GMV. Show "Recommended" label. Rep can override. |
| 5 | **Smart Subject Line Tokens** | Subject is a generic template across all merchants | Add tokens like `{Location Count}`, `{Last Active}`, `{Category}` that pull from BOB data and personalise the subject per merchant. |
| 6 | **Campaign History Log** | No record of who was contacted, when, or what was sent | After each session, auto-write a log entry to `localStorage` with: Date, Merchant, Email, Promos Sent, Status. Export to Excel. Add a "History" tab to the app. |

---

## 🟡 P2 | Experience Polish (Phase 3)

| # | Feature | Problem | Solution |
|---|---------|---------|---------|
| 7 | **Email Validation on Upload** | Invalid emails only discovered at send time | On BOB upload, flag emails failing regex check with a ⚠️ badge. Option to skip invalid emails automatically. |
| 8 | **Smart Bulk Select Filters** | "Select All" selects too many irrelevant merchants | Add one-click filters: "No active campaigns", "Multi-location (3+)", "Missing email", "High GMV". Combine freely. |
| 9 | **Inbox-Accurate Preview** | Preview uses app CSS, not actual email rendering | Render `htmlBody` in a sandboxed 600px `<iframe>` | no app styles leak in. Desktop / Mobile toggle. |
| 10 | **Rep Signature in Settings** | Signature is hardcoded in email template | reps with different titles must manually edit every session | Move signature (Name, Title, Phone, LinkedIn) to Settings. Signature block auto-generates from `repSettings`. One-time setup. |
| 11 | **Template Library** | Reps write the same intros every campaign from scratch | 5–6 pre-written intros (Re-engagement, New merchant welcome, Multi-location upsell, Seasonal push, ROI follow-up). One click loads into the editor. |
| 12 | **DM Name Fallback** | `{DM Name}` shows literally when BOB has no DM Name column | Auto-fall back to "the team" and flag with "💡 Add DM Name column to BOB for personalised greetings." |

---

## 🟢 P3 | Strategic / Future (Phase 4+)

| # | Feature | Problem | Solution |
|---|---------|---------|---------|
| 13 | **Google OAuth → GAS Bridge** | GAS restricted to "Anyone within DoorDash" | external fetch can't auth | Add Google Identity Services (one `<script>`). Rep signs in once, app gets Bearer token, GAS calls include it. Unlocks full rich-HTML Gmail Drafts with zero Ctrl+V. |
| 14 | **Campaign ROI Dashboard** | No visibility on whether emails converted to activations | After sending, rep marks each merchant: ✅ Activated / 💬 Responded / ❌ No response. Aggregate into a "My conversion rate" dashboard tab. |
| 15 | **Scheduled Send** | Best open rates are Tue–Thu 9–11 AM; reps compose at any time | "Schedule batch" button saves state and fires a browser notification at the chosen time to trigger the Gmail queue. |
| 16 | **Mobile Companion View** | Rep needs to reference sent emails on mobile for follow-up | Read-only view: sent merchant names, email addresses, promo links. Optimised for mobile. Accessible via URL hash. |

---

## Phased Execution Order

```
Phase 1 | Start immediately (no open questions)
  #2  Session persistence
  #10 Signature in settings
  #9  Inbox-accurate iframe preview
  #1  Gmail paste reminder banner

Phase 2 | Needs BOB data clarity
  #3  Merchant priority scoring
  #8  Bulk select filters
  #6  Campaign history log
  #7  Email validation on upload

Phase 3 | Content & intelligence
  #11 Template library
  #4  Promo recommendations
  #5  Smart subject line tokens
  #12 DM name fallback

Phase 4 | Infrastructure & scale
  #13 Google OAuth + GAS bridge
  #14 ROI dashboard
  #15 Scheduled send
  #16 Mobile view
```

---

## Open Questions

> **Q1 | BOB Data Richness**
> Does your current BOB export include: GMV/revenue estimate, last campaign activation date, or merchant join date?
> Required for Priority Scoring (#3) and Smart Subject Tokens (#5).

> **Q2 | Google OAuth Setup**
> Are you willing to spend ~10 minutes creating a free Google Cloud project?
> This eliminates Ctrl+V entirely by enabling authenticated GAS calls for full rich-HTML Gmail Drafts.

> **Q3 | Template Ownership**
> Should the Template Library be local (per-device) or shared across the MSM team?
> Local = no backend needed. Shared = requires a Google Sheet or simple JSON file on a shared drive.

> **Q4 | Campaign Log Sync**
> Is `localStorage` (stays on your machine) acceptable for campaign history, or does it need to sync somewhere like Google Sheets?
