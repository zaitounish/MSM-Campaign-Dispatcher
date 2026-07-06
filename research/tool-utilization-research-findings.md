# Tool Utilization Research Findings

## Key Metric Categories for Rep Tool Utilization Tracking

### 1. Engagement/Adoption Metrics
- **Daily Active Users (DAU)**: Unique reps logging in per day
- **Weekly Active Users (WAU)**: Unique reps logging in per week
- **Monthly Active Users (MAU)**: Unique reps logging in per month
- **Login frequency**: Average sessions per rep per period
- **Session duration**: Average and median session length
- **Session count**: Total sessions per period

### 2. Feature Adoption Metrics
- **Feature usage rate**: % of reps using each feature in a period
- **Feature adoption curve**: Time to adoption for new features
- **Feature sequence analysis**: Common workflow paths through features
- **Feature drop-off**: Where reps abandon feature flows
- **Feature depth**: How thoroughly each feature is used

### 3. Workflow Efficiency Metrics
- **Time-to-first-campaign**: From login to first campaign draft
- **Merchant processing rate**: Merchants handled per hour/session
- **Emails-per-session**: Average emails composed per session
- **Promo configuration time**: Time spent customizing each promo
- **Template usage**: % using templates vs custom emails

### 4. Volume Metrics
- **Emails sent**: Daily/weekly/monthly total and per-rep
- **Promo type distribution**: Which promos are most used
- **Merchants targeted**: Unique merchants contacted per period
- **Email formats**: HTML vs plaintext ratio
- **Delivery methods**: CC vs BCC vs mailto preference

### 5. Consistency/Compliance Metrics
- **Daily limit adherence**: Hits vs override requests
- **Blank email usage**: % of sends without promos (bypasses quota)
- **Approval workflows**: Requests, approvals, denials
- **Template compliance**: % using approved templates
- **Login consistency**: Regular vs irregular usage patterns

### 6. Comparative Metrics
- **Team averages**: Individual rep metrics vs team median
- **Period comparison**: Current vs previous period
- **Segment comparison**: Top/bottom quintile analysis
- **Region/team comparison**: Cross-group benchmarking
- **Role-based comparison**: Rep vs manager tool usage


## Industry Best Practices from Sales Enablement Platforms

### 1. Rep Scorecards
- Composite "Tool Utilization Score" combining multiple metrics
- Weighted scoring system (e.g. login frequency 30%, feature breadth 25%, email volume 20%, etc.)
- Tier classification: High/Medium/Low utilization
- Trend indicators: Improving/stable/declining

### 2. Health Indices
- **Tool Health Index**: Composite of adoption, engagement, and efficiency
- **Feature health scores**: Usage rate × user satisfaction × business impact
- Early warning systems for underutilized features
- Correlate tool usage with business outcomes

### 3. Benchmarking
- Team vs team comparison dashboards
- Role-specific benchmarks (reps vs managers)
- Historical trending (MoM, QoQ)
- Industry standards integration where available


## Logging Strategy

### 1. Session-Level Logging
- Login events with timestamp, IP, device info
- Session duration tracking
- Feature access sequence
- Logout/re-engagement patterns

### 2. Action-Level Logging
- Promo selection events
- Merchant selection and processing
- Email preview and send actions
- Edit actions (template customization, content changes)
- Navigation paths through the tool

### 3. Feature-Level Logging
- Admin panel access
- Dashboard views and interactions
- Settings changes and preference updates
- Report generation and exports
- Training/resource access


## Alert & Notification Patterns

### 1. Rep Inactivity Alerts
- No login for N consecutive days
- No activity (emails sent) for N days
- Gradual dis-engagement patterns

### 2. Daily Limit Alerts
- Approaching daily email limit
- Hit daily email limit
- Repeated override requests

### 3. Engagement Alerts
- Below team median engagement
- Only using limited features
- High drop-off in workflows

### 4. Positive Notifications
- First login of new rep
- First use of advanced feature
- Milestone achievements (e.g. 100 emails sent)


## Manager Decision-Making Applications

### 1. Coaching Identification
- Low engagement reps
- Feature adoption gaps
- Workflow inefficiencies
- Non-compliant behavior patterns

### 2. Feature Improvement
- Underused features needing better docs/training
- Common drop-off points in workflows
- Feature usage patterns suggesting UI issues

### 3. Business Correlation
- Tool usage vs merchant response rates
- Email volume vs campaign effectiveness
- Feature adoption vs sales outcomes
- Usage patterns of top-performing reps


## Implementation Recommendations

### 1. Start with Core Metrics
- DAU/WAU/MAU
- Session duration and count
- Email volume and types
- Basic feature usage tracking

### 2. Layer in Advanced Analytics
- Composite scores and indices
- Benchmarking and comparisons
- Predictive alerts
- Business outcome correlation

### 3. Privacy Considerations
- Aggregate team data
- Individual rep data only for managers
- No personal content tracking
- Clear data retention policies