# AGENTS.md — MSM Campaign Dispatcher

## DO NOT MODIFY — DoorDash spec contract

`src/lib/deepLinkBuilder.js` (lines 22-247) is a **DoorDash contract, not app logic**. 100% read-only — including comments and header.

Frozen: URL shape, param names/order, `%2C` sids encoding, `business_id` / `sids` / `assisted_rep_id` / `dsd` globals, cents math (`Math.round(...*100)`, `floor(/7)*100`, `bscv=500`, `bsao=0`), `pt=undefined`, loyalty-only-`business_id`, `2500` fallback, lean URLs, master builder mapping. Values like `1400` (= $14.00 in cents) are correct spec, not bugs.

### Rules for agentic AI

1. Never edit `src/lib/deepLinkBuilder.js` for any reason — no logic, comment, or formatting changes.
2. Promo URL issues must be fixed at call sites only (e.g. `src/App.jsx:197-199`) with null-guards (`?? []` / `?? {}`), passing values verbatim — no coercion before the builder.
3. Phase 3 (`src/components/PromoCustomizer.jsx`) validates user inputs only via `getPromoConfigErrors` error strings — never rewrites URL shape. Builder `|| 0` / `|| "all"` fallbacks stay unchanged.
4. Golden-URL snapshot tests (`src/lib/__tests__/deepLinkBuilder.golden.test.js`, `node --test`) own the contract — any param name/order/encoding change must fail.
