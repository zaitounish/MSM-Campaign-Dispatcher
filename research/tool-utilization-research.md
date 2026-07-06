# B2B Operational Analytics for Sales/Enablement Tool Utilization Tracking

## Overview
This research focuses on tracking the utilization of the DoorDash MSM Campaign Dispatcher tool by Merchant Success Managers (MSMs). The goal is to provide the "Ultimate" role with insights into how MSMs are using the tool, identifying areas for improvement, and correlating tool usage with business outcomes.

## Key Metric Categories

### 1. Engagement/Adoption Metrics
- **DAU (Daily Active Users)**: Number of unique MSMs logging in daily.
- **WAU (Weekly Active Users)**: Number of unique MSMs logging in weekly.
- **MAU (Monthly Active Users)**: Number of unique MSMs logging in monthly.
- **Login Frequency**: Average number of logins per MSM per week/month.
- **Session Duration**: Average time spent in the tool per session.
- **Session Count**: Total number of sessions per MSM per week/month.

### 2. Feature Adoption Metrics
- **Feature Usage**: Percentage of MSMs using each feature (e.g., promo selection, merchant selection).
- **Feature Adoption Rate**: Rate at which new features are adopted over time.
- **Feature Drop-off**: Rate at which usage of a feature decreases over time.

### 3. Workflow Efficiency Metrics
- **Time-to-First-Campaign**: Time taken from login to sending the first campaign.
- **Merchant Processing Rate**: Average number of merchants processed per session.
- **Emails-Per-Session**: Average number of emails sent per session.

### 4. Volume Metrics
- **Emails Sent**: Total emails sent per day/week/month.
- **Promo Types Used**: Distribution of promo types used in campaigns.
- **Merchants Targeted**: Average number of merchants targeted per session.

### 5. Consistency/Compliance Metrics
- **Daily Limit Hits**: Number of times MSMs hit their daily email limit.
- **Blank Email Usage**: Percentage of emails sent without content.
- **Approval Request Frequency**: Number of approval requests made per MSM per week/month.

### 6. Comparative Metrics
- **Team Averages**: Average metrics across the entire MSM team.
- **Trending Over Time**: Changes in metrics over time (e.g., monthly trends).

## Industry Best Practices
Sales enablement platforms like Outreach.io, Salesloft, HubSpot, and Salesforce implement the following practices:
- **Rep Scorecards**: Individual performance dashboards for MSMs.
- **Utilization Scoring**: Scoring MSMs based on their tool usage and efficiency.
- **Health Indices**: Combining multiple metrics into a single health score for each MSM.
- **Benchmarking**: Comparing individual MSM performance against team averages.

## Logging Levels

### Session-Level Logging
- **Login Event**: Timestamp of login.
- **Session Duration**: Total time spent in the session.
- **Feature Sequence**: Sequence of features used during the session.

### Action-Level Logging
- **Promo Selection**: Type of promo selected.
- **Merchant Selection**: Merchants selected for the campaign.
- **Email Preview**: Number of times email preview is opened.
- **Send Action**: Timestamp of email send action.
- **Edit Action**: Timestamp and details of email edits.

### Feature-Level Logging
- **Admin Panel Opens**: Number of times the admin panel is opened.
- **Dashboard Views**: Number of times the dashboard is viewed.
- **Settings Changes**: Changes made to settings.

## Alert/Notification Patterns
- **Rep Inactivity Alerts**: Notify managers if an MSM hasn't logged in for N days.
- **Daily Limit Approach Warnings**: Warn MSMs when they approach their daily email limit.
- **Low Engagement Alerts**: Notify managers if an MSM's engagement is below the team median.
- **First-Time Feature Adoption**: Celebrate and notify when an MSM uses a feature for the first time.

## Utilization Data in Manager Decision-Making
- **Coaching Needs**: Identify MSMs who may need additional training or support.
- **Feature Documentation**: Understand which features need better documentation or training.
- **Business Outcomes**: Correlate tool usage with merchant response rates and other business outcomes.
