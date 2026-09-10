# Role-Based Access Control (RBAC) Configuration & Security Specification
**Project:** MSM Campaign Dispatcher  
**Database:** Supabase (PostgreSQL with Row Level Security)  
**Last Updated:** September 2026  

---

## 1. Executive Summary & Security Model

The MSM Campaign Dispatcher utilizes a **multi-layered, defense-in-depth Role-Based Access Control (RBAC)** architecture combining:

1. **Database-Level Roles (PostgreSQL Roles):** Determines connection-level privileges (`anon`, `authenticated`, `service_role`).
2. **Row-Level Security (RLS) Policies:** Guarantees isolation between merchant success managers at the database engine level.
3. **Application-Level Roles (`reps_whitelist`):** Governs administrative capabilities, quota escalations, and feature gates (`rep`, `manager`, `ultimate`).
4. **Scoped `SECURITY DEFINER` RPC Functions:** Provides controlled elevation for specific single-column updates and fail-safe settings sync without granting broad write access.

---

## 2. Infrastructure / Database Connection Roles

| Role | Auth Status | Purpose | Permissions Scope |
| :--- | :--- | :--- | :--- |
| **`anon`** | Unauthenticated | Pre-login landing page & OTP verification | - `USAGE` on schema `public`<br>- `SELECT` on `reps_whitelist` (to verify whitelist status)<br>- **NO** access to `rep_settings`, `email_send_log`, or activity logs |
| **`authenticated`** | Authenticated via JWT (OTP) | Logged-in DoorDash reps & admins | - `USAGE` on schema `public`<br>- `ALL` on `rep_settings` (scoped strictly by RLS)<br>- `INSERT` / `SELECT` on `email_send_log`<br>- `EXECUTE` on authorized stored procedures (`set_my_rep_id`, `get_my_rep_settings`, `save_my_rep_settings`) |
| **`service_role`** | Internal Secret Token | Automation, maintenance & migration scripts | - Bypasses all Row-Level Security policies (`BYPASSRLS`)<br>- Full read/write across all schemas |

---

## 3. Application-Level Roles (`reps_whitelist.role`)

Every authenticated user maps to an active profile entry in `reps_whitelist`:

```
┌───────────────────────────────────────────────────────────────┐
│                      reps_whitelist                           │
├─────────────┬─────────────────────────────────────────────────┤
│ rep         │ Standard MSM User                               │
│ manager     │ Team Lead / Approver                            │
│ ultimate    │ Full Administrator / Platform Owner             │
└─────────────┴─────────────────────────────────────────────────┘
```

### 3.1 Role Capabilities

#### 👤 `rep` (Merchant Success Manager)
* **Settings Management:** Full CRUD on own `rep_settings` (Rep ID, Google Apps Script URL, Gemini API Key, signature, name, phone). Cannot view or edit any other rep's settings.
* **Campaign Dispatching:** Can dispatch campaigns up to their daily sending limit (`daily_email_limit` or manager-granted `daily_limit_override`).
* **Self Rep ID Mirroring:** Can update their own `rep_id` in `reps_whitelist` via `set_my_rep_id()`.
* **Limit Escalation:** Can submit a quota bump request to their designated manager or admins.
* **Audit Trail:** Read access only to their own `email_send_log` and `rep_sessions`.

#### 👔 `manager` (Team Manager / Approver)
* **All `rep` capabilities.**
* **Approval Dashboard:** Can view pending daily email limit escalation requests assigned to them or unassigned requests (`manager_id IS NULL`).
* **Quota Overrides:** Can approve or deny limit requests, setting `daily_limit_override` on a rep's profile for the current calendar day.

#### 👑 `ultimate` (Platform Admin)
* **All `manager` & `rep` capabilities.**
* **User Management:** Can view all reps in the whitelist, invite new reps, edit roles, toggle active status, and modify base daily limits.
* **Global Approval Access:** Can view and resolve all limit escalation requests organization-wide.
* **Global Telemetry:** Can query aggregate feature usage, system-wide email dispatch logs, and active rep sessions.

---

## 4. Resource & Table Permissions Matrix (CRUD)

| Resource / Table | `anon` | `rep` (Authenticated) | `manager` | `ultimate` | Policy / Mechanism |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`rep_settings`** | ❌ None | `CRUD (Own)` | `CRUD (Own)` | `CRUD (Own)` | RLS: `lower(rep_email) = lower(auth.jwt() ->> 'email')` |
| **`reps_whitelist`** | `R (Lookup)` | `R (Own)` + `U (rep_id only)` | `R (Team)` + `U (Limits)` | `CRUD (All)` | - Lookup: `ilike` email<br>- `rep_id` update: `set_my_rep_id` RPC<br>- Admin: `role = 'ultimate'` |
| **`email_send_log`** | ❌ None | `C (Own)` + `R (Own)` | `C (Own)` + `R (Own)` | `CR (All)` | RLS: Reps match `rep_email = auth.jwt() ->> 'email'` |
| **`limit_approval_requests`** | ❌ None | `C (Own)` + `R (Own)` | `R (Assigned)` + `U` | `CRUD (All)` | RLS: Manager assignment check / Ultimate override |
| **`rep_activity_log`** | ❌ None | `C (Own)` + `R (Own)` | `C (Own)` + `R (Own)` | `CR (All)` | RLS: `rep_email = auth.jwt() ->> 'email'` |
| **`rep_sessions`** | ❌ None | `CRU (Own)` | `CRU (Own)` | `CRU (All)` | RLS: `rep_email = auth.jwt() ->> 'email'` |

*Legend: C = Create, R = Read, U = Update, D = Delete*

---

## 5. Row Level Security (RLS) Policy Implementations

### 5.1 `rep_settings` (Per-Rep Isolation)

Ensures that API keys, Google Apps Script endpoints, and signatures are strictly private to the authenticated rep.

```sql
-- Enable RLS
ALTER TABLE public.rep_settings ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated connection role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON TABLE public.rep_settings TO authenticated;

-- Owner-only policy (Case-insensitive JWT email matching)
CREATE POLICY "Reps manage own settings" ON public.rep_settings
  FOR ALL
  TO authenticated
  USING (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
```

### 5.2 `email_send_log` (Campaign Logs)

```sql
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

-- Reps view only their own sends
CREATE POLICY "Reps view own send log" ON public.email_send_log
  FOR SELECT TO authenticated
  USING (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR EXISTS (
      SELECT 1 FROM public.reps_whitelist
       WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         AND role = 'ultimate'
    )
  );

-- Reps can record their own sends
CREATE POLICY "Reps insert own send log" ON public.email_send_log
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
```

### 5.3 `limit_approval_requests` (Hierarchy Escalation)

```sql
ALTER TABLE public.limit_approval_requests ENABLE ROW LEVEL SECURITY;

-- Reps view own requests; Managers view assigned requests; Ultimates view all
CREATE POLICY "View limit approval requests" ON public.limit_approval_requests
  FOR SELECT TO authenticated
  USING (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR EXISTS (
      SELECT 1 FROM public.reps_whitelist w
       WHERE lower(w.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         AND (w.role = 'ultimate' OR w.id = limit_approval_requests.manager_id OR limit_approval_requests.manager_id IS NULL)
    )
  );
```

---

## 6. Stored Procedures & Elevated RPC Functions (`SECURITY DEFINER`)

When operations require fine-grained access control that cannot be cleanly modeled by full-table `UPDATE` grants, `SECURITY DEFINER` functions are used. Each procedure verifies the caller's JWT identity before executing.

### 6.1 `set_my_rep_id`
* **Purpose:** Allows a rep to update only their `rep_id` field in `reps_whitelist` without granting them `UPDATE` rights on `role`, `daily_email_limit`, or `is_active`.
* **Execution:** `GRANT EXECUTE ON FUNCTION public.set_my_rep_id(text) TO authenticated;`
* **Security Check:** `WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))`

### 6.2 `get_my_rep_settings`
* **Purpose:** Direct fail-safe read of caller's settings row.
* **Execution:** `GRANT EXECUTE ON FUNCTION public.get_my_rep_settings() TO authenticated;`
* **Security Check:** Caller identity extracted via `auth.jwt() ->> 'email'`. Bypasses REST table grant friction while maintaining strict single-tenant isolation.

### 6.3 `save_my_rep_settings`
* **Purpose:** Direct fail-safe upsert of caller's settings row.
* **Execution:** `GRANT EXECUTE ON FUNCTION public.save_my_rep_settings(...) TO authenticated;`
* **Security Check:** Always upserts against `lower(auth.jwt() ->> 'email')`. Impossible for a caller to write to another rep's row.

---

## 7. Operational & Security Guardrails

1. **Case-Insensitive Identity Matching:**  
   All checks use `lower(email) = lower(auth.jwt() ->> 'email')`. This prevents privilege escalation or session de-synchronization caused by mixed-case inputs.
2. **Secrets Protection:**  
   The `rep_settings` table contains sensitive credentials (`gemini_api_key`, `gas_url`). No `SELECT` policy exists for `anon` or across reps. Even managers cannot view their subordinates' API keys.
3. **Defense Against Cookie / Cache Invalidation:**  
   Local client storage (`localStorage`) acts strictly as a temporary UI cache. The database (`rep_settings` row) is the single source of truth and is automatically loaded upon every authenticated session.
