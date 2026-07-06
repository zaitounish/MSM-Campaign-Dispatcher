# Supabase Analytics Architecture for Tool Utilization Tracking

This document outlines the recommended approach for implementing a tool utilization tracking system using Supabase for the DoorDash MSM Campaign Dispatcher application.

## 1. Recommended New Table Schemas

### Tool Utilization Tracking Tables

#### rep_activity_log (Granular Event Tracking)
```sql
CREATE TABLE rep_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_email TEXT NOT NULL REFERENCES reps_whitelist(email) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout', 'feature_access', 'tool_use', 'form_submit', 'navigation')),
    feature_name TEXT, -- e.g., 'campaign_builder', 'email_editor', 'analytics_dashboard'
    tool_used TEXT, -- Specific tool within feature (optional)
    action_details JSONB, -- Context-specific data (what button clicked, form submitted, etc.)
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER, -- For timing specific actions
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_rep_activity_log_rep_email ON rep_activity_log(rep_email);
CREATE INDEX idx_rep_activity_log_session_id ON rep_activity_log(session_id);
CREATE INDEX idx_rep_activity_log_timestamp ON rep_activity_log(timestamp);
CREATE INDEX idx_rep_activity_log_event_type ON rep_activity_log(event_type);
CREATE INDEX idx_rep_activity_log_feature_name ON rep_activity_log(feature_name);
```

#### rep_sessions (Session Tracking)
```sql
CREATE TABLE rep_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rep_email TEXT NOT NULL REFERENCES reps_whitelist(email) ON DELETE CASCADE,
    session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_end TIMESTAMPTZ,
    duration_minutes INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (session_end - session_start)) / 60
    ) STORED,
    login_method TEXT, -- e.g., 'password', 'sso', 'magic_link'
    device_info JSONB, -- Browser, OS, screen resolution
    ip_address INET,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_rep_sessions_rep_email ON rep_sessions(rep_email);
CREATE INDEX idx_rep_sessions_session_start ON rep_sessions(session_start);
CREATE INDEX idx_rep_sessions_is_active ON rep_sessions(is_active);
```

#### feature_usage_aggregates (Pre-aggregated Analytics)
```sql
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

-- Indexes
CREATE INDEX idx_feature_usage_aggregates_rep_email ON feature_usage_aggregates(rep_email);
CREATE INDEX idx_feature_usage_aggregates_date ON feature_usage_aggregates(date);
CREATE INDEX idx_feature_usage_aggregates_feature_name ON feature_usage_aggregates(feature_name);
```

## 2. Row Level Security (RLS) Policies

### Enable RLS on all new tables
```sql
ALTER TABLE rep_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_usage_aggregates ENABLE ROW LEVEL SECURITY;
```

### RLS Policies for Rep Activity Log
```sql
-- Reps can only see their own activity
CREATE POLICY "Reps can view own activity log"
ON rep_activity_log FOR SELECT
TO authenticated
USING (rep_email = auth.email());

-- Reps can only insert their own activity
CREATE POLICY "Reps can insert own activity log"
ON rep_activity_log FOR INSERT
TO authenticated
WITH CHECK (rep_email = auth.email());

-- Ultimates (admins) can view all activity
CREATE POLICY "Ultimates can view all activity log"
ON rep_activity_log FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM reps_whitelist 
        WHERE email = auth.email() AND role = 'ultimate'
    )
);

-- Ultimates can insert activity (for system-generated logs)
CREATE POLICY "Ultimates can insert activity log"
ON rep_activity_log FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM reps_whitelist 
        WHERE email = auth.email() AND role = 'ultimate'
    )
);
```

### RLS Policies for Rep Sessions
```sql
-- Reps can only see their own sessions
CREATE POLICY "Reps can view own sessions"
ON rep_sessions FOR SELECT
TO authenticated
USING (rep_email = auth.email());

-- Reps can only insert/update their own sessions
CREATE POLICY "Reps can modify own sessions"
ON rep_sessions FOR ALL
TO authenticated
USING (rep_email = auth.email())
WITH CHECK (rep_email = auth.email());

-- Ultimates can view all sessions
CREATE POLICY "Ultimates can view all sessions"
ON rep_sessions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM reps_whitelist 
        WHERE email = auth.email() AND role = 'ultimate'
    )
);
```

### RLS Policies for Feature Usage Aggregates
```sql
-- Reps can only see their own aggregates
CREATE POLICY "Reps can view own aggregates"
ON feature_usage_aggregates FOR SELECT
TO authenticated
USING (rep_email = auth.email());

-- Ultimates can view all aggregates
CREATE POLICY "Ultimates can view all aggregates"
ON feature_usage_aggregates FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM reps_whitelist 
        WHERE email = auth.email() AND role = 'ultimate'
    )
);

-- System job can update aggregates (using service_role)
CREATE POLICY "Service role can manage aggregates"
ON feature_usage_aggregates FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

## 3. Key SQL Queries for Common Analytics

### Daily Tool Utilization Per Rep
```sql
SELECT 
    r.full_name,
    r.email,
    f.feature_name,
    f.date,
    f.total_sessions,
    f.total_tool_uses,
    f.avg_session_duration_minutes,
    f.unique_tools_used
FROM feature_usage_aggregates f
JOIN reps_whitelist r ON f.rep_email = r.email
WHERE f.date >= CURRENT_DATE - INTERVAL '30 days'
AND r.is_active = true
ORDER BY f.date DESC, r.full_name, f.feature_name;
```

### Real-time Active Sessions
```sql
SELECT 
    r.full_name,
    r.email,
    s.session_start,
    EXTRACT(EPOCH FROM (NOW() - s.session_start)) / 60 AS current_duration_minutes,
    s.device_info->>'browser' AS browser,
    s.device_info->>'os' AS os
FROM rep_sessions s
JOIN reps_whitelist r ON s.rep_email = r.email
WHERE s.is_active = true
AND s.session_start > NOW() - INTERVAL '2 hours'
ORDER BY s.session_start DESC;
```

### Feature Usage Trends (Last 7 Days)
```sql
SELECT 
    feature_name,
    date,
    SUM(total_sessions) OVER (PARTITION BY feature_name ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_week_sessions,
    SUM(total_tool_uses) OVER (PARTITION BY feature_name ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_week_tool_uses
FROM feature_usage_aggregates
WHERE date >= CURRENT_DATE - INTERVAL '6 days'
ORDER BY feature_name, date;
```

### Most Used Tools by Feature
```sql
SELECT 
    feature_name,
    jsonb_object_agg(tool_used, usage_count) AS tool_usage_distribution
FROM (
    SELECT 
        feature_name,
        tool_used,
        COUNT(*) AS usage_count
    FROM rep_activity_log
    WHERE event_type = 'tool_use'
    AND timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY feature_name, tool_used
) sub
GROUP BY feature_name
ORDER BY feature_name;
```

### Session Duration Distribution
```sql
SELECT 
    CASE 
        WHEN duration_minutes < 5 THEN '0-5 min'
        WHEN duration_minutes < 15 THEN '5-15 min'
        WHEN duration_minutes < 30 THEN '15-30 min'
        WHEN duration_minutes < 60 THEN '30-60 min'
        ELSE '60+ min'
    END AS duration_bucket,
    COUNT(*) AS session_count,
    AVG(duration_minutes) AS avg_duration
FROM rep_sessions
WHERE session_end IS NOT NULL
AND session_start >= NOW() - INTERVAL '30 days'
GROUP BY duration_bucket
ORDER BY 
    CASE duration_bucket
        WHEN '0-5 min' THEN 1
        WHEN '5-15 min' THEN 2
        WHEN '15-30 min' THEN 3
        WHEN '30-60 min' THEN 4
        ELSE 5
    END;
```

## 4. Real-time Capabilities

### Supabase Realtime for Live Dashboard Updates

#### Postgres Changes for Live Activity Feed
```javascript
// Subscribe to live activity updates
const activityChannel = supabase
  .channel('rep-activity-live')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'rep_activity_log',
      filter: 'rep_email=eq.' + userEmail // For rep-specific view
      // Remove filter for ultimate view to see all activity
    },
    (payload) => {
      // Update dashboard with new activity
      console.log('New activity:', payload.new);
    }
  )
  .subscribe();

// For ultimate dashboard - see all rep activity
const ultimateActivityChannel = supabase
  .channel('ultimate-activity-feed')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'rep_activity_log'
    },
    (payload) => {
      // Broadcast to all connected ultimate users
      // Could filter by manager_id or team if needed
    }
  )
  .subscribe();
```

#### Broadcast for Real-time Metrics Updates
```javascript
// Broadcast updated metrics to dashboard clients
async function broadcastMetricsUpdate(metrics) {
  await supabase
    .channel('dashboard-metrics')
    .send({
      type: 'broadcast',
      event: 'metrics-update',
      payload: metrics
    });
}

// Client side - listen for metrics updates
const metricsChannel = supabase
  .channel('dashboard-metrics')
  .on(
    'broadcast',
    { event: 'metrics-update' },
    (payload) => {
      // Update dashboard charts/metrics
      updateDashboard(payload.payload);
    }
  )
  .subscribe();
```

#### Presence for Active User Tracking
```javascript
// Track user presence in the application
const presenceChannel = supabase
  .channel('app-presence')
  .on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    // Update online user count
  })
  .on('presence', { event: 'join' }, ({ key, newPresences }) => {
    // User joined
  })
  .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    // User left
  })
  .subscribe();

// When user becomes active
await presenceChannel.track({
  userId: user.id,
  repEmail: user.email,
  lastSeen: new Date().toISOString(),
  currentFeature: currentRoute.name
});
```

## 5. Performance Considerations at Scale

### Materialized Views for Complex Aggregates
```sql
-- Materialized view for daily rep performance
CREATE MATERIALIZED VIEW rep_daily_performance AS
SELECT 
    rwl.idxrep_email,
    DATE(timestamp) as activity_date,
    COUNT(*) as total_events,
    COUNT(DISTINCT session_id) as unique_sessions,
    COUNT(CASE WHEN event_type = 'tool_use' THEN 1 END) as tool_uses,
    COUNT(DISTINCT feature_name) as features_used,
    AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) as avg_action_duration
FROM rep_activity_log
WHERE timestamp >= NOW() - INTERVAL '90 days'
GROUP BY rep_email, DATE(timestamp)
WITH DATA;

-- Index on materialized view
CREATE INDEX idx_rep_daily_performance_email_date ON rep_daily_performance(rep_email, activity_date);

-- Refresh materialized view periodically (via cron)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY rep_daily_performance;
```

### Partitioning for Large Activity Logs
```sql
-- Create partitioned table by month for better query performance
CREATE TABLE rep_activity_log_partitioned (
    LIKE rep_activity_log INCLUDING ALL
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE rep_activity_log_2026_07 PARTITION OF rep_activity_log_partitioned
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE rep_activity_log_2026_08 PARTITION OF rep_activity_log_partitioned
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- And so on for future months...

-- Indexes on partitioned table (automatically inherited)
CREATE INDEX idx_rep_activity_log_partitioned_rep_email ON rep_activity_log_partitioned(rep_email);
CREATE INDEX idx_rep_activity_log_partitioned_timestamp ON rep_activity_log_partitioned(timestamp);
```

### Connection Pooling and Read Replicas
- Use Supavisor connection pooler in transaction mode for better connection efficiency
- Configure read replicas for analytics queries to reduce load on primary database
- Set up separate connection pools for realtime vs. batch analytics workloads

### Caching Strategy
- Cache frequently accessed aggregate data in Redis or Supabase Edge Functions cache
- Implement cache invalidation triggers when new activity data is inserted
- Use stale-while-revalidate pattern for dashboard data

## 6. Data Retention and Anonymization Policies

### Data Retention Strategy
```sql
-- Retention policy: Keep granular logs for 90 days, aggregated data for 2 years
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS void AS $$
BEGIN
    -- Delete granular activity logs older than 90 days
    DELETE FROM rep_activity_log 
    WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- Delete completed sessions older than 90 days
    DELETE FROM rep_sessions 
    WHERE session_end IS NOT NULL 
    AND session_end < NOW() - INTERVAL '90 days';
    
    -- Keep aggregated data longer (2 years) for trend analysis
    DELETE FROM feature_usage_aggregates 
    WHERE date < CURRENT_DATE - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup via Supabase Cron (runs daily at 2 AM)
SELECT cron.schedule(
    'daily-activity-cleanup',
    '0 2 * * *',
    $$SELECT cleanup_old_activity_logs();$$
);
```

### Anonymization for Privacy Compliance
```sql
-- Function to anonymize rep data when they leave the company
CREATE OR REPLACE FUNCTION anonymize_rep_data(rep_email_param TEXT)
RETURNS void AS $$
DECLARE
    anon_email TEXT;
BEGIN
    -- Generate anonymous identifier
    anon_email := 'anon_' || md5(rep_email_param || clock_timestamp()) || '@deleted.local';
    
    -- Anonymize activity logs
    UPDATE rep_activity_log 
    SET 
        rep_email = anon_email,
        ip_address = '0.0.0.0',
        user_agent = 'ANONYMIZED'
    WHERE rep_email = rep_email_param;
    
    -- Anonymize sessions
    UPDATE rep_sessions 
    SET 
        rep_email = anon_email,
        ip_address = '0.0.0.0',
        device_info = '{}'::jsonb
    WHERE rep_email = rep_email_param;
    
    -- Anonymize aggregates (keep for trends but remove PII)
    UPDATE feature_usage_aggregates 
    SET rep_email = anon_email
    WHERE rep_email = rep_email_param;
    
    -- Update rep whitelist (mark as anonymized)
    UPDATE reps_whitelist 
    SET 
        email = anon_email,
        full_name = 'ANONYMIZED_USER',
        is_active = false
    WHERE email = rep_email_param;
END;
$$ LANGUAGE plpgsql;
```

### GDPR/CCPA Compliance Features
- Export functionality for user data requests
- Right to be forgotten implementation
- Data minimization principles (only collect necessary usage data)
- Pseudonymization where full anonymization isn't required for analytics

## 7. Dashboarding Approach Recommendations

### Option 1: Internal React Dashboard (Recommended)
**Pros:**
- Full control over UI/UX and branding
- Seamless integration with existing MSM Campaign Dispatcher
- Real-time updates via Supabase Realtime
- No additional licensing costs
- Customizable for specific manager needs

**Implementation:**
- Use existing React/Vite stack
- Charts: Recharts, Chart.js, or Victory
- Real-time updates: Supabase Realtime hooks
- Authentication: Leverage existing Supabase Auth
- Role-based views: Rep sees own data, Ultimate sees team/company-wide

### Option 2: Connect to BI Tool (Alternative)
**Pros:**
- Advanced visualization capabilities
- Built-in sharing and collaboration
- Enterprise-grade reporting features

**Cons:**
- Additional cost and complexity
- Potential data latency
- Less real-time capability
- Requires ETL pipeline setup

**Recommended BI Tools if chosen:**
- Metabase (open-source, easy setup)
- Superset (Apache, powerful but complex)
- Tableau/Power BI (enterprise, expensive)

### Hybrid Approach
- Use internal React dashboard for real-time operational metrics
- Export aggregated data weekly to BI tool for deep-dive analysis
- Maintain single source of truth in Supabase

## 8. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
1. Create new tables with proper indexes
2. Implement RLS policies
3. Set up basic activity logging hooks in frontend
4. Create basic session tracking

### Phase 2: Real-time Features (Weeks 3-4)
1. Implement Supabase Realtime subscriptions
2. Add presence tracking for online users
3. Create basic real-time dashboard components
4. Set up materialized views for common queries

### Phase 3: Analytics & Optimization (Weeks 5-6)
1. Implement aggregate table updates (via triggers or cron)
2. Create advanced analytics queries
3. Add data retention and anonymization procedures
4. Performance testing and optimization

### Phase 4: Dashboard & UI (Weeks 7-8)
1. Build ultimate dashboard with real-time charts
2. Create rep personal activity view
3. Implement export/reporting functionality
4. User acceptance testing and refinement

## 9. Security Considerations

### Principle of Least Privilege
- Reps: Only read/write own activity data
- Managers: Read access to team activity (if needed)
- Ultimates: Read access to all activity data
- Service role: Used only for backend aggregation jobs

### Audit Logging
```sql
-- Enable pg_audit extension for compliance tracking
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Configure audit logging
ALTER SYSTEM SET pgaudit.log = 'read, write, role, ddl';
ALTER SYSTEM SET pgaudit.log_relation = 'rep_activity_log, rep_sessions';
```

### API Security
- Use Row Level Security as primary defense
- Validate all inputs at application level
- Use JWT claims for additional context in policies
- Regular security scanning of RLS policies

## 10. Estimated Resource Requirements

### Storage Estimates
- Activity logs: ~1KB per event × 100 events/rep/day × 100 reps × 365 days = ~3.65 GB/year
- With 90-day retention: ~900 GB maximum
- Aggregates: Minimal (<100 MB)

### Performance Targets
- Real-time activity feed: <500ms latency
- Dashboard initial load: <2s
- Aggregate queries: <100ms
- Session start/end tracking: <100ms overhead

### Scaling Considerations
- Horizontal scaling via Supabase's built-in capabilities
- Read replicas for analytics workloads
- Proper indexing strategy as outlined
- Monitoring via pg_stat_statements (enable extension)

This architecture provides a secure, scalable foundation for tracking tool utilization while maintaining strict data privacy and enabling real-time insights for both individual reps and ultimate administrators.