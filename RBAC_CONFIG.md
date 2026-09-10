# Role-Based Access Control (RBAC) Configuration File

**System:** MSM Campaign Dispatcher / Merchant Success Hub  
**Document Type:** RBAC Declarative Configuration & Policy Specification  
**Format Version:** 1.2.0  
**Target Engine:** Supabase / PostgreSQL RLS + Application-Level Middleware & UI Guards  
**Last Updated:** September 2026  
**Status:** Active / Production-Ready  

---

## 1. Declarative RBAC Configuration (Machine-Readable)

The following YAML specification defines the complete RBAC model, including roles, hierarchy, permission catalogs, role-to-permission mappings, resource rules, and attribute-based conditions (ABAC).

```yaml
rbac_version: "1.2.0"
system_id: "msm-campaign-dispatcher"
auth_provider:
  type: "supabase_jwt"
  identity_claim: "email"
  case_normalization: "lower"
  unauthenticated_role: "anon"
  authenticated_role: "authenticated"

# ==============================================================================
# Role Hierarchy & Inheritance
# ==============================================================================
roles:
  rep:
    name: "Merchant Success Manager"
    code: "rep"
    level: 10
    description: "Standard sales & success representative. Dispatches campaigns and manages personal settings."
    inherits: []

  manager:
    name: "Team Lead / Approver"
    code: "manager"
    level: 50
    description: "Team manager with quota escalation approval and team monitoring capabilities."
    inherits:
      - "rep"

  ultimate:
    name: "Platform Owner / Administrator"
    code: "ultimate"
    level: 100
    description: "Full platform owner with whitelist management, global oversight, and telemetry access."
    inherits:
      - "manager"

# ==============================================================================
# Permission Catalog
# ==============================================================================
permissions:
  # Rep Settings (Personal Credentials & Configuration)
  - id: "settings:read:own"
    description: "Read personal rep settings (API keys, GAS URL, signature, rep ID)"
  - id: "settings:update:own"
    description: "Create or update personal rep settings"
  - id: "settings:delete:own"
    description: "Delete or reset personal rep settings"

  # Campaign Dispatching
  - id: "campaign:dispatch"
    description: "Dispatch bulk merchant email campaigns up to daily limit"
  - id: "campaign:history:read:own"
    description: "View personal email send history and recipient logs"
  - id: "campaign:history:read:all"
    description: "View organization-wide email send logs"

  # Profile & Whitelist Self-Service
  - id: "profile:read:own"
    description: "View personal whitelist record and assigned daily limit"
  - id: "profile:update:repid"
    description: "Update own rep_id in the whitelist (via scoped RPC)"

  # Quota & Escalation
  - id: "quota:request:bump"
    description: "Submit a daily email limit escalation request"
  - id: "quota:approval:read:assigned"
    description: "View limit escalation requests assigned to caller or unassigned"
  - id: "quota:approval:read:all"
    description: "View all limit escalation requests across the organization"
  - id: "quota:approval:resolve"
    description: "Approve or reject limit escalation requests and set daily_limit_override"

  # User & Whitelist Administration
  - id: "users:read:team"
    description: "View team members and rep utilization metrics"
  - id: "users:read:all"
    description: "View full user whitelist, roles, statuses, and base limits"
  - id: "users:create"
    description: "Invite or add new users to the whitelist"
  - id: "users:update:role"
    description: "Change user role between rep and manager"
  - id: "users:update:status"
    description: "Toggle user active/inactive status"
  - id: "users:update:limit"
    description: "Modify user default base daily sending limit"
  - id: "users:delete"
    description: "Remove non-ultimate user from whitelist"

  # Telemetry & Audit Logs
  - id: "telemetry:read:own"
    description: "View own session and activity logs"
  - id: "telemetry:read:global"
    description: "View aggregate executive dashboard, system telemetry, and audit logs"

# ==============================================================================
# Role-to-Permissions Mapping
# ==============================================================================
role_permissions:
  rep:
    - "settings:read:own"
    - "settings:update:own"
    - "settings:delete:own"
    - "campaign:dispatch"
    - "campaign:history:read:own"
    - "profile:read:own"
    - "profile:update:repid"
    - "quota:request:bump"
    - "telemetry:read:own"

  manager:
    # Inherits all permissions from 'rep' plus:
    - "quota:approval:read:assigned"
    - "quota:approval:resolve"
    - "users:read:team"

  ultimate:
    # Inherits all permissions from 'manager' and 'rep' plus:
    - "campaign:history:read:all"
    - "quota:approval:read:all"
    - "users:read:all"
    - "users:create"
    - "users:update:role"
    - "users:update:status"
    - "users:update:limit"
    - "users:delete"
    - "telemetry:read:global"

# ==============================================================================
# Resource Rules & Field-Level Access Control (FLAC)
# ==============================================================================
resources:
  rep_settings:
    table: "public.rep_settings"
    owner_column: "rep_email"
    identity_mapping: "lower(rep_email) = lower(auth.jwt() ->> 'email')"
    sensitive_columns:
      - "gemini_api_key"
      - "gas_url"
    rules:
      - role: "anon"
        actions: []
      - role: "rep"
        actions: ["select", "insert", "update", "delete"]
        condition: "is_owner"
      - role: "manager"
        actions: ["select", "insert", "update", "delete"]
        condition: "is_owner"
        note: "Managers CANNOT view or edit subordinate API keys or settings."
      - role: "ultimate"
        actions: ["select", "insert", "update", "delete"]
        condition: "is_owner"
        note: "Secrets remain single-tenant even for administrators."

  reps_whitelist:
    table: "public.reps_whitelist"
    owner_column: "email"
    rules:
      - role: "anon"
        actions: ["select"]
        allowed_columns: ["email", "is_active"]
        condition: "lookup_for_auth"
      - role: "rep"
        actions: ["select"]
        condition: "is_owner"
        allowed_rpc: ["public.set_my_rep_id"]
      - role: "manager"
        actions: ["select", "update"]
        condition: "is_team_member"
        modifiable_columns: ["daily_limit_override", "override_date"]
      - role: "ultimate"
        actions: ["select", "insert", "update", "delete"]
        condition: "all_except_self_delete"
        restricted_actions:
          - action: "delete"
            target_role: "ultimate"
            allowed: false
          - action: "change_role"
            target_role: "ultimate"
            allowed: false

  email_send_log:
    table: "public.email_send_log"
    owner_column: "rep_email"
    rules:
      - role: "anon"
        actions: []
      - role: "rep"
        actions: ["insert", "select"]
        condition: "is_owner"
      - role: "manager"
        actions: ["insert", "select"]
        condition: "is_owner"
      - role: "ultimate"
        actions: ["select", "insert"]
        condition: "all"

  limit_approval_requests:
    table: "public.limit_approval_requests"
    owner_column: "rep_email"
    rules:
      - role: "anon"
        actions: []
      - role: "rep"
        actions: ["insert", "select"]
        condition: "is_owner"
      - role: "manager"
        actions: ["select", "update"]
        condition: "is_assigned_or_unassigned"
      - role: "ultimate"
        actions: ["select", "update", "delete"]
        condition: "all"

  rep_activity_log:
    table: "public.rep_activity_log"
    owner_column: "rep_email"
    rules:
      - role: "anon"
        actions: []
      - role: "rep"
        actions: ["insert", "select"]
        condition: "is_owner"
      - role: "manager"
        actions: ["insert", "select"]
        condition: "is_owner"
      - role: "ultimate"
        actions: ["select", "insert"]
        condition: "all"

  rep_sessions:
    table: "public.rep_sessions"
    owner_column: "rep_email"
    rules:
      - role: "anon"
        actions: []
      - role: "rep"
        actions: ["select", "insert", "update"]
        condition: "is_owner"
      - role: "manager"
        actions: ["select", "insert", "update"]
        condition: "is_owner"
      - role: "ultimate"
        actions: ["select", "insert", "update", "delete"]
        condition: "all"
```

---

## 2. Infrastructure & Connection Roles

| Connection Role | Authentication Status | Database Privileges | Purpose |
| :--- | :--- | :--- | :--- |
| **`anon`** | Unauthenticated | `USAGE` on schema `public`; `SELECT` on `reps_whitelist` (`email`, `is_active`). | Pre-login landing, OTP sign-in verification. |
| **`authenticated`** | JWT Authenticated (`auth.jwt()`) | `USAGE` on schema `public`; `ALL` on `rep_settings` (RLS scoped); `INSERT`/`SELECT` on `email_send_log`; `EXECUTE` on designated RPCs. | Standard active user session. |
| **`service_role`** | Internal Bearer Secret Token | Bypasses Row-Level Security (`BYPASSRLS`); full table CRUD. | Automated migrations, cron maintenance, background tasks. |

---

## 3. Application Roles & Capabilities Matrix

```
┌─────────────────────────────────────────────────────────────┐
│                       reps_whitelist                        │
├──────────────┬──────────────────────────────────────────────┤
│ rep          │ Standard Merchant Success Representative     │
│ manager      │ Team Lead / Escalation Approver              │
│ ultimate     │ Full Platform Administrator & Owner          │
└──────────────┴──────────────────────────────────────────────┘
```

### 3.1 Role Hierarchy & Inheritance Diagram

```
       [ rep ] (Base Role: Settings CRUD, Dispatching, Own Logs)
          │
          ▼
    [ manager ] (Inherits 'rep' + Approval Queue, Quota Overrides, Team View)
          │
          ▼
   [ ultimate ] (Inherits 'manager' + Whitelist CRUD, Roles, Global Telemetry)
```

### 3.2 Granular Permissions Matrix

| Resource / Action | `anon` | `rep` | `manager` | `ultimate` | Enforcement Layer |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Manage Own Settings (`rep_settings`)** | ❌ | ✅ | ✅ | ✅ | Database RLS (`is_owner`) |
| **View Peer / Subordinate Settings & Keys** | ❌ | ❌ | ❌ | ❌ | Strict Isolation (Zero-Trust) |
| **Dispatch Campaign within Daily Limit** | ❌ | ✅ | ✅ | ✅ | Client Guard + Dispatcher API |
| **Update Own `rep_id`** | ❌ | ✅ | ✅ | ✅ | Scoped RPC `set_my_rep_id` |
| **Submit Quota Escalation Request** | ❌ | ✅ | ✅ | ✅ | Database RLS (`INSERT own`) |
| **View Own Send Logs & Telemetry** | ❌ | ✅ | ✅ | ✅ | Database RLS (`is_owner`) |
| **View Assigned / Unassigned Quota Requests** | ❌ | ❌ | ✅ | ✅ | Database RLS (`manager_id` check) |
| **Approve / Deny Quota Escalation** | ❌ | ❌ | ✅ | ✅ | RPC / UPDATE `daily_limit_override` |
| **View Team Rep Utilization** | ❌ | ❌ | ✅ | ✅ | Component Guard / Query Filter |
| **View Full Whitelist & System Users** | ❌ | ❌ | ❌ | ✅ | AdminPanel + Database RLS |
| **Invite / Add New Users** | ❌ | ❌ | ❌ | ✅ *(Disabled)* | AdminPanel `canAdd` |
| **Toggle User Active Status (`is_active`)** | ❌ | ❌ | ❌ | ✅ | AdminPanel + Database RLS |
| **Modify Base Daily Limits (`daily_email_limit`)** | ❌ | ❌ | ❌ | ✅ | AdminPanel + Database RLS |
| **Change User Roles (`rep` ↔ `manager`)** | ❌ | ❌ | ❌ | ✅ | AdminPanel `canChangeRole` |
| **Modify `ultimate` Role / Delete `ultimate`** | ❌ | ❌ | ❌ | ❌ | Guardrail: Self/Peer Ultimate Lock |
| **Global Send Logs & Audit Telemetry** | ❌ | ❌ | ❌ | ✅ | `UltimateDashboard` + RLS |

---

## 4. Row Level Security (RLS) Policy Implementations

### 4.1 `rep_settings` (Strict Single-Tenant Isolation)

> [!IMPORTANT]
> API keys (`gemini_api_key`) and Google Apps Script webhook URLs (`gas_url`) are private to the individual representative. Under no circumstance should one rep or manager view another's credentials.

```sql
-- 1. Table Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.rep_settings TO authenticated;
GRANT ALL ON TABLE public.rep_settings TO service_role;

-- 2. Enable RLS
ALTER TABLE public.rep_settings ENABLE ROW LEVEL SECURITY;

-- 3. Case-Insensitive Owner Policy
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

### 4.2 `email_send_log` (Campaign Activity)

```sql
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON TABLE public.email_send_log TO authenticated;

-- Reps view own sends; Ultimates view all sends
CREATE POLICY "email_send_log_select_policy" ON public.email_send_log
  FOR SELECT TO authenticated
  USING (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR EXISTS (
      SELECT 1 FROM public.reps_whitelist
       WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         AND role = 'ultimate'
         AND is_active = true
    )
  );

-- Insert permitted only for caller's authenticated email
CREATE POLICY "email_send_log_insert_policy" ON public.email_send_log
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
```

### 4.3 `limit_approval_requests` (Quota Escalation Queue)

```sql
ALTER TABLE public.limit_approval_requests ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.limit_approval_requests TO authenticated;

-- Rep views own requests; Manager views assigned or unassigned; Ultimate views all
CREATE POLICY "limit_approval_requests_select_policy" ON public.limit_approval_requests
  FOR SELECT TO authenticated
  USING (
    -- 1. Requester views own
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR EXISTS (
      SELECT 1 FROM public.reps_whitelist w
       WHERE lower(w.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         AND w.is_active = true
         AND (
           -- 2. Ultimate views all
           w.role = 'ultimate'
           -- 3. Manager views assigned or unassigned
           OR (w.role = 'manager' AND (limit_approval_requests.manager_id IS NULL OR limit_approval_requests.manager_id = w.id))
         )
    )
  );

-- Rep inserts own request
CREATE POLICY "limit_approval_requests_insert_policy" ON public.limit_approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Managers and Ultimates can update/resolve requests
CREATE POLICY "limit_approval_requests_update_policy" ON public.limit_approval_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reps_whitelist w
       WHERE lower(w.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         AND w.is_active = true
         AND (
           w.role = 'ultimate'
           OR (w.role = 'manager' AND (limit_approval_requests.manager_id IS NULL OR limit_approval_requests.manager_id = w.id))
         )
    )
  );
```

---

## 5. Elevated RPC Functions (`SECURITY DEFINER`)

For operations where direct `UPDATE` privileges on tables would pose security risks (such as allowing callers to alter their own `role` or `daily_email_limit`), elevated stored procedures verify identity and execute scoped mutations.

### 5.1 `set_my_rep_id`
* **Signature:** `public.set_my_rep_id(p_rep_id text)`
* **Permissions:** `GRANT EXECUTE ON FUNCTION public.set_my_rep_id(text) TO authenticated;`
* **Behavior:** Updates only the caller's `rep_id` in `reps_whitelist`. Cannot alter roles or limits.

```sql
CREATE OR REPLACE FUNCTION public.set_my_rep_id(p_rep_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.reps_whitelist
     SET rep_id = NULLIF(TRIM(p_rep_id), '')
   WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
END;
$$;
```

### 5.2 `get_my_rep_settings` & `save_my_rep_settings`
* **Signatures:**
  - `public.get_my_rep_settings() RETURNS jsonb`
  - `public.save_my_rep_settings(...) RETURNS boolean`
* **Permissions:** `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
* **Behavior:** Provides a fail-safe fallback for loading and saving settings via PostgREST RPC, bypassing REST table grant friction while strictly enforcing `lower(auth.jwt() ->> 'email')`.

---

## 6. Application-Layer Access Control Rules

### 6.1 UI Component & Route Guards

| Component / View | Minimum Role | Enforcing Helper | Fallback Behavior |
| :--- | :---: | :--- | :--- |
| **`Campaign Dispatcher`** | `rep` | `userProfile?.is_active === true` | Redirect to `LockScreen` / Inactive alert |
| **`RepSettingsModal`** | `rep` | Authenticated session | Disabled save / Alert |
| **`SendLogDashboard`** | `rep` | `userProfile?.is_active === true` | Scoped to own logs (or global if `ultimate`) |
| **`Manager Alerts Panel`** | `manager` | `['manager', 'ultimate'].includes(role)` | Tab hidden in Header |
| **`Rep Utilization Table`** | `manager` | `role === 'manager' \|\| role === 'ultimate'` | Hidden / rep view restricted |
| **`AdminPanel (Approvals Tab)`** | `manager` | `role === 'manager' \|\| role === 'ultimate'` | Tab hidden |
| **`AdminPanel (Whitelist Tab)`** | `ultimate` | `role === 'ultimate'` | Tab hidden / Read-only |
| **`UltimateDashboard (Telemetry)`**| `ultimate` | `role === 'ultimate'` | Tab hidden |

### 6.2 Administrative Action Matrix (Role Mutation & Deletion)

```javascript
// Definition of role mutation guards
export const canDelete = (actorRole, targetRole) => {
  if (actorRole === "ultimate") {
    // Ultimate cannot delete or suspend another Ultimate
    return targetRole !== "ultimate";
  }
  return false; // Managers and Reps cannot delete users
};

export const canChangeRole = (actorRole, targetRole) => {
  if (actorRole === "ultimate") {
    // Ultimate can change rep/manager, but cannot demote an ultimate
    return targetRole !== "ultimate";
  }
  return false; // Managers cannot change roles
};

export const assignableRoles = (actorRole) => {
  if (actorRole === "ultimate") {
    // Ultimate can assign rep or manager
    return ["rep", "manager"];
  }
  return [];
};
```

---

## 7. Security Guardrails & Operational Runbook

1. **Identity Canonicalization:**  
   All email identity checks at both the database level (`RLS`) and stored procedure level MUST wrap both sides in `lower()`.  
   *Pattern:* `lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))`
2. **Zero-Knowledge Secrets Isolation:**  
   Credentials (`gemini_api_key`, `gas_url`) stored in `rep_settings` are never exposed through aggregate analytics or managerial dashboards.
3. **Daily Limit Overrides Expiry:**  
   `daily_limit_override` applies only to the date specified in `override_date` (`YYYY-MM-DD`). Upon the next UTC date boundary, the sending quota automatically reverts to the rep's base `daily_email_limit`.
4. **Emergency Role Revocation:**  
   To immediately revoke access for an offboarded representative:
   ```sql
   UPDATE public.reps_whitelist
      SET is_active = false
    WHERE lower(email) = lower('user@doordash.com');
   ```
   Active sessions will be locked out upon their next JWT refresh or token validation.
