// Where the practice values come from. Every glossary field carries a
// data_origin (telecom_base = borrowed telecom practice set, simulated =
// made-up behavioural data); the matching line is shown at the bottom of each
// field tooltip. DEMO_TAG_FIELDS lists the only four fields that also carry
// the small "demo" pill next to their label.
export const DEMO_NOTE: Record<string, string> = {
  telecom_base:
    'Demo value: this comes from a telecom practice dataset. Real Highspring data will replace it.',
  simulated: 'Demo value: this is simulated practice data.',
}

export const DEMO_TAG_FIELDS = new Set([
  'Engagement_Type',         // Contract length
  'Service_Type',            // Plan (service package)
  'Monthly_Client_Value',    // Monthly payment
  'Cumulative_Client_Value', // Total paid so far
])

export const DEMO_PILL_TOOLTIP =
  'This value is a demo stand-in for now. Real Highspring client data will replace it later.'