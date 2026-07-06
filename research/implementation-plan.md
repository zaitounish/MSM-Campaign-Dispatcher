# Tool Utilization Dashboard Implementation Plan

## Phase 1: Foundation (2 weeks)

### 1. Supabase Schema Updates
```sql
CREATE TABLE rep_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_email TEXT NOT NULL REFERENCES reps_whitelist(email) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout', 'feature_access', 'tool_use', 'form_submit', 'navigation')),
  feature_name TEXT,
  tool_used TEXT,
  action_details JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_email TEXT NOT NULL REFERENCES reps_whitelist(email) ON DELETE CASCADE,
  session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_end TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (session_end - session_start)) / 60
  ) STORED,
  login_method TEXT,
  device_info JSONB,
  ip_address INET,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE feature_usage_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_email TEXT NOT NULL REFERENCES reps_whitelist(email) ON DELETE CASCADE,
  feature_name TEXT NOT NULL,
  date DATE NOT NULL,
  total_sessions INTEGER DEFAULT 0,
  total_tool_uses INTEGER DEFAULT 0,
  avg_session_duration_minutes DECIMAL(5,2),
  unique_tools_used INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rep_email, feature_name, date)
);
```

### 2. RLS Policies
```sql
CREATE POLICY "Reps view own activity" 
ON rep_activity_log 
FOR SELECT 
TO authenticated 
USING (rep_email = auth.email());

CREATE POLICY "Ultimates view all activity" 
ON rep_activity_log 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM reps_whitelist 
  WHERE email = auth.email() AND role = 'ultimate'
));
```

### 3. Basic Instrumentation Hooks
```javascript
// Session tracking
export const trackSession = async (repEmail) => {
  const { data, error } = await supabase
    .from('rep_sessions')
    .insert({
      rep_email: repEmail,
      session_start: new Date().toISOString(),
      device_info: getDeviceInfo()
    })
    .select('id')
    .maybeSingle();
  return data?.id;
};

// Feature usage tracking
export const trackFeatureUse = async (sessionId, repEmail, featureName, details = {}) => {
  await supabase.from('rep_activity_log').insert({
    rep_email: repEmail,
    session_id: sessionId,
    event_type: 'feature_access',
    feature_name: featureName,
    action_details: details,
    timestamp: new Date().toISOString()
  });
};
```


## Phase 2: Analytics & Real-Time (2 weeks)

### 1. Real-Time Dashboard Components
```javascript
// Real-time updates
const setupRealtime = () => {
  supabase.channel('activity_live')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'rep_activity_log' },
      (payload) => {
        // Update dashboard UI
      }
    )
    .subscribe();
};

// Presence tracking
const setupPresence = () => {
  supabase.channel('presence')
    .on('presence', { event: 'sync' }, () => {
      const presenceState = supabase.channel('presence').presenceState();
    })
    .subscribe();
};
```

### 2. Alert System
```javascript
// Configure alerts
const setupAlerts = async (repEmail) => {
  // Check for inactivity
  const { data } = await supabase
    .from('rep_sessions')
    .select('session_start')
    .eq('rep_email', repEmail)
    .order('session_start', { ascending: false })
    .limit(1);
  
  if (data.length === 0 || isOlderThan(data[0].session_start, 3)) {
    await triggerAlert('inactivity', repEmail);
  }
};
```


## Phase 3: Polish & Optimization (1 week)

### Dashboard UI Structure
```components/
  dashboard/
    ExecutiveSummary.jsx
    RepTable.jsx
    TrendCharts.jsx
    AlertPanel.jsx
    FeatureHealth.jsx
    TeamComparison.jsx
hooks/
  useActivityData.js
  useRealtimeUpdates.js
  useManagerAlerts.js
```

### Sample SQL for Trend Analysis
```sql
-- Daily active reps trend
SELECT
  date_trunc('day', timestamp) as day,
  COUNT(DISTINCT rep_email) as daily_active_reps,
  COUNT(*) as activity_events
FROM rep_activity_log
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- Feature usage trend
SELECT
  feature_name,
  date_trunc('week', date) as week,
  SUM(total_tool_uses) as weekly_uses
FROM feature_usage_aggregates
WHERE date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1, 2
ORDER BY 1, 2;
```


## Deployment Strategy

1. **Environment Setup**
   - Supabase project configuration
   - RLS policy implementation
   - Table creation with proper indexes

2. **Staged Rollout**
   - Week 1: Internal QA testing
   - Week 2: Manager pilot group
   - Week 3: Full rep rollout

3. **Monitoring**
   - Database performance metrics
   - Dashboard load times
   - Alert delivery success rates


## Privacy & Compliance

- Implement data retention policies (90 days granular data, 2 years aggregates)
- Create anonymization procedures for departing reps
- Establish audit logging for Ultimate access
- Define clear RLS policies for all roles