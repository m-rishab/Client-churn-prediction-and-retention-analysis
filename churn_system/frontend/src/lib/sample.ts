import type { PredictResult } from './api'

export const SAMPLE_CLIENT: Record<string, string | number> = {
  Client_Tenure_Months: 2,
  Service_Type: 'Fiber optic',
  Support_Access: 'No',
  Engagement_Type: 'Month-to-month',
  Monthly_Client_Value: 64,
  Cumulative_Client_Value: 130,
  Content_Quality_Score: 60,
  Content_Score_Trend_30D: -3,
  Guideline_Compliance_Score: 78,
  Compliance_Flags: 2,
  Critical_Compliance_Issues: 1,
  Engagement_Score: 45,
  Monthly_Engagements: 4,
  Client_Meetings: 1,
  Report_Views: 4,
  Response_Rate: 55,
  Support_Tickets: 2,
  Unresolved_Support_Tickets: 1,
  Avg_Resolution_Time: 30,
  Days_Since_Last_Engagement: 30,
  Search_Visibility_Change: -4,
  Traffic_Change: -5,
}

/**
 * A second sample for visual QA: a healthy, long-tenured client that scores
 * Low risk (verified against predict_utils: probability 0.0014).
 */
export const LOW_CLIENT: Record<string, string | number> = {
  Client_Tenure_Months: 65,
  Service_Type: 'DSL',
  Support_Access: 'Yes',
  Engagement_Type: 'Two year',
  Monthly_Client_Value: 85,
  Cumulative_Client_Value: 5400,
  Content_Quality_Score: 88,
  Content_Score_Trend_30D: 4,
  Guideline_Compliance_Score: 94,
  Compliance_Flags: 0,
  Critical_Compliance_Issues: 0,
  Engagement_Score: 88,
  Monthly_Engagements: 12,
  Client_Meetings: 3,
  Report_Views: 30,
  Response_Rate: 95,
  Support_Tickets: 1,
  Unresolved_Support_Tickets: 0,
  Avg_Resolution_Time: 10,
  Days_Since_Last_Engagement: 1,
  Search_Visibility_Change: 6,
  Traffic_Change: 9,
}

export const FIELD_GROUPS: Record<string, string[]> = {
  'About the account': [
    'Client_Tenure_Months',
    'Service_Type',
    'Support_Access',
    'Engagement_Type',
    'Monthly_Client_Value',
    'Cumulative_Client_Value',
  ],
  'Content and guidelines': [
    'Content_Quality_Score',
    'Content_Score_Trend_30D',
    'Guideline_Compliance_Score',
    'Compliance_Flags',
    'Critical_Compliance_Issues',
  ],
  'How active the client is': [
    'Engagement_Score',
    'Monthly_Engagements',
    'Client_Meetings',
    'Report_Views',
    'Response_Rate',
    'Days_Since_Last_Engagement',
  ],
  'Help requests': [
    'Support_Tickets',
    'Unresolved_Support_Tickets',
    'Avg_Resolution_Time',
  ],
  'Google Search and website': [
    'Search_Visibility_Change',
    'Traffic_Change',
  ],
}

export const BAND_SENTENCE: Record<string, string> = {
  Low: 'This client looks steady. Low risk of leaving.',
  Medium: 'Keep an eye on this client. Medium risk of leaving.',
  High: 'This client may be about to leave. High risk.',
}

// The API returns the model's raw action string (e.g. "Save now - senior
// advisor call + content strategy review within 7 days"). The UI shows a
// short plain version; the full text stays in the API and the segment meaning.
const ACTION_MAP: Record<string, string> = {
  'Save now - senior advisor call + content strategy review within 7 days':
    'Call this client within 7 days.',
  'Automated nudge - email/portal tips + self-serve content check':
    'Send a short helpful email.',
  'Nurture - quarterly business review + upsell content roadmap':
    'Check in every quarter.',
  'Monitor - automated health score, standard support': 'No action needed now.',
}

export function friendlyAction(action: string): string {
  return ACTION_MAP[action] ?? action
}

export function buildSummary(r: PredictResult): string {
  const reasons = r.top_3_reasons
    .map((x) => `${x.label} (${x.direction === 'up' ? 'raised' : 'lowered'} the score)`)
    .join(', ')
  return [
    `Client: ${r.client_id}`,
    `Risk: ${r.risk_score} out of 100 (${r.risk_band})`,
    `Group: ${r.segment} - ${r.segment_meaning}`,
    `Top reasons: ${reasons}`,
    `Next step: ${r.recommended_action}`,
    `(A guide, not a promise. Made-up practice data.)`,
  ].join('\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
