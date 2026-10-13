import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'https://taliferro.com'

// Deliberately small and separate from static-browse.js: every call here hits
// the real OpenAI API (real cost) and the concierge Cloud Function, which is
// capped at maxInstances: 10 in functions/index.js. Don't scale this past
// that cap unless you've raised it — you're testing a queue, not a CDN.
const TARGET_VUS = Number(__ENV.TARGET_VUS || 5)
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 30)
const HOLD_MINUTES = Number(__ENV.HOLD_MINUTES || 5)

const PROMPTS = [
  'What services does Taliferro offer?',
  'Do you help with fractional CTO work?',
  'Can you tell me about API consulting?',
  'What industries do you work with?',
]

export const options = {
  stages: [
    { duration: `${RAMP_SECONDS}s`, target: TARGET_VUS },
    { duration: `${HOLD_MINUTES}m`, target: TARGET_VUS },
    { duration: `${RAMP_SECONDS}s`, target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
}

export default function () {
  const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]

  const res = http.post(
    `${BASE_URL}/api/concierge`,
    JSON.stringify({
      eventType: 'reply',
      messages: [{ role: 'user', content: prompt }],
      meta: { page: '/', loadtest: true },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )

  check(res, {
    'status is 200': (r) => r.status === 200,
    'not rejected by instance cap': (r) => r.status !== 429 && r.status !== 503,
  })

  sleep(5 + Math.random() * 10)
}
