import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'https://taliferro.com'
const TARGET_VUS = Number(__ENV.TARGET_VUS || 100)
const RAMP_MINUTES = Number(__ENV.RAMP_MINUTES || 5)
const HOLD_MINUTES = Number(__ENV.HOLD_MINUTES || 50)

// Representative mix of real pages — home, top service pages, a blog post,
// and low-traffic pages — instead of hammering one URL.
const PAGES = [
  '/',
  '/about.html',
  '/contact.html',
  '/it-consultant-seattle',
  '/fractional-cto',
  '/agile-coaching',
  '/api-design-services',
  '/cloud-architecture-consulting',
  '/machine-learning-services',
  '/case-studies.html',
  '/blog',
]

export const options = {
  stages: [
    { duration: `${RAMP_MINUTES}m`, target: TARGET_VUS },
    { duration: `${HOLD_MINUTES}m`, target: TARGET_VUS },
    { duration: `${RAMP_MINUTES}m`, target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
  // k6 Cloud only: spreads load across real global points of presence so
  // requests genuinely originate from different regions, not just one VM.
  cloud: {
    distribution: {
      usEast: { loadZone: 'amazon:us:ashburn', percent: 35 },
      usWest: { loadZone: 'amazon:us:portland', percent: 15 },
      europe: { loadZone: 'amazon:ie:dublin', percent: 25 },
      asia: { loadZone: 'amazon:sg:singapore', percent: 15 },
      australia: { loadZone: 'amazon:au:sydney', percent: 10 },
    },
  },
}

export default function () {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)]
  const res = http.get(`${BASE_URL}${page}`, {
    tags: { page },
  })

  check(res, {
    'status is 200': (r) => r.status === 200,
  })

  // think time between page views, mimics a real visitor reading a page
  sleep(3 + Math.random() * 9)
}
