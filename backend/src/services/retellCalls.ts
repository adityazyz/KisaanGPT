import axios from 'axios';

const RETELL_API_KEY  = process.env.RETELL_API_KEY!;
const RETELL_BASE     = 'https://api.retellai.com';
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID!;    // your Retell agent ID
const RETELL_FROM_NUM = process.env.RETELL_PHONE_NUMBER!; // your Retell purchased number

const retell = axios.create({
  baseURL: RETELL_BASE,
  headers: {
    Authorization: `Bearer ${RETELL_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

export interface CallPayload {
  farmerName:   string;
  cropName:     string;
  stageLabel:   string;
  stagePurpose: string;
  stageDate:    string;  // YYYY-MM-DD
  toPhone:      string;  // E.164 format, e.g. +919876543210
}

/**
 * Trigger an immediate outbound call via Retell AI.
 * The agent receives context via `retell_llm_dynamic_variables` so it can
 * personalise the call without hardcoding anything.
 * All conversation happens in Hindi.
 */
export async function triggerCall(payload: CallPayload): Promise<string> {
  const { data } = await retell.post('/v2/create-phone-call', {
    agent_id:    RETELL_AGENT_ID,
    from_number: RETELL_FROM_NUM,
    to_number:   normalisePhone(payload.toPhone),
    retell_llm_dynamic_variables: {
      farmer_name:   payload.farmerName,
      crop_name:     payload.cropName,
      stage_label:   payload.stageLabel,
      stage_purpose: payload.stagePurpose,
      stage_date:    payload.stageDate,
    },
  });

  return data.call_id as string;
}

/**
 * Normalise an Indian phone number to E.164 (+91XXXXXXXXXX).
 */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Build per-stage call purposes in Hindi for the Retell agent.
 * These are injected as `stage_purpose` into the dynamic variables.
 */
export function buildStagePurpose(stageLabel: string, cropName: string): string {
  const map: Record<string, string> = {
    'Sowing':             `किसान को ${cropName} की बुवाई के सही तरीके, बीज की मात्रा, और मिट्टी की तैयारी के बारे में बताएं। किसान के किसी भी सवाल का जवाब दें।`,
    'Germination Check':  `किसान को ${cropName} के अंकुरण की जाँच करने और खाली जगहों को भरने के बारे में मार्गदर्शन दें।`,
    'First Fertilizer':   `किसान को ${cropName} के लिए पहली खाद डालने का सही समय, मात्रा और तरीका बताएं।`,
    'First Irrigation':   `किसान को ${cropName} की पहली सिंचाई के बारे में — कब, कितना पानी, और कैसे — जानकारी दें।`,
    'Pest Monitoring':    `किसान को ${cropName} में कीट और रोगों की निगरानी के तरीके बताएं। किसी लक्षण के बारे में पूछें और उपाय सुझाएं।`,
    'Second Fertilizer':  `किसान को ${cropName} के लिए दूसरी खाद (टॉप ड्रेसिंग) की जानकारी दें — यूरिया या पोटाश की मात्रा और तरीका।`,
    'Pre-Harvest Check':  `किसान को ${cropName} की कटाई से पहले फसल की परिपक्वता जाँचने और भंडारण या परिवहन की व्यवस्था करने की सलाह दें।`,
    'Harvest':            `किसान को ${cropName} की कटाई के सही समय, तरीके और कटाई के बाद की देखभाल के बारे में बताएं। बाजार भाव और बिक्री के विकल्पों पर भी चर्चा करें।`,
  };

  // Default for any unlisted stage
  return map[stageLabel] ??
    `किसान को ${cropName} की खेती में ${stageLabel} चरण के बारे में जानकारी दें और उनके सवालों का जवाब दें।`;
}