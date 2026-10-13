export const CONCIERGE_ENDPOINT = '/api/concierge'
export const CONCIERGE_FALLBACK_ENDPOINT =
  'https://us-central1-taliferro-de66f.cloudfunctions.net/concierge'

export const TYPE_TITLES = {
  explainer: 'Start here',
  video: 'Watch',
  image: 'Gallery',
  blog: 'Deep dives',
  'page-preview': 'Recommended reads',
  testimonial: 'What people say',
  service: 'Services',
  product: 'Products',
  feature: 'Capabilities',
  brochure: 'Brochures',
  'case-study': 'Case studies',
  pricing: 'Pricing',
  cta: 'Next step'
}

export const SEED_GUIDE_TEXT =
  'Give me the situation. I’ll ask questions, then show the best path.'

export const ROTATE_MS = 5200
export const ROTATING_PROMPTS = [
  'What are you trying to improve right now?',
  'Tell me the problem in one sentence.',
  'Where does work stall for your team?',
  'What do you need to fix this month?',
  'Are you exploring AI, security, or web?',
  'What would “better” look like this quarter?'
]

// Asset path helper for both Live Server (/root/public/) and Firebase Hosting (web root)
export function assetPath (p) {
  const isLiveServerNested = window.location.pathname.includes('/root/public/')
  const base = isLiveServerNested ? '/root/public' : ''
  return base + p
}

export function escapeHtml (str) {
  return (str || '').replace(
    /[&<>"']/g,
    c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  )
}

export function uniq (arr) {
  const out = []
  const seen = new Set()
  ;(arr || []).forEach(v => {
    const s = String(v)
    if (!s) return
    if (seen.has(s)) return
    seen.add(s)
    out.push(s)
  })
  return out
}

// Shared mutable state (single source of truth)
export const state = {
  meta: null,
  messages: [],
  revealed: [],
  lastChoices: [],
  prompt: '',
  lastSelectedChoice: '',
  lastSelectedChoiceValue: '',
  cta: [],
  hasScrolled: false,
  hasInteracted: false,
  idleTimer: null,
  isCalling: false,
  abortController: null,
  lastEventType: '',
  lastError: '',
  requestSeq: 0,
  activeRequestSeq: 0,
  loadingLabel: '',

  rotateTimer: null,
  rotateIndex: 0,
  rotateLocked: false,

  // Sales-stage state machine (drives captivate → fascinate → educate → close)
  // Values: 'captivate' | 'fascinate' | 'educate' | 'close'
  salesStage: 'captivate',
  salesStageReason: '',
  salesStageUpdatedAt: 0,

  // One-time closing beat guard
  hasOfferedCall: false,

  // Call-offer state machine
  // When true, the next visitor input is interpreted as yes/no.
  callOfferPending: false,
  callOfferAnswer: '', // 'yes' | 'no' | ''
  callOfferAskedAt: 0
}

// Render batching flag lives here so UI + concierge agree
export let SUPPRESS_RENDER = false
export function setSuppressRender (v) {
  SUPPRESS_RENDER = !!v
}

export function withBatchRender (fn, render) {
  const prev = SUPPRESS_RENDER
  setSuppressRender(true)
  try {
    fn()
  } finally {
    setSuppressRender(prev)
    if (!SUPPRESS_RENDER && typeof render === 'function') render()
  }
}

// Visitor attribution / meta
export function getMeta () {
  const url = new URL(window.location.href)
  const params = url.searchParams

  // Stable visitor id
  const VISITOR_KEY = 'tf_visitor_id'
  let visitor_id = ''
  try {
    visitor_id = localStorage.getItem(VISITOR_KEY) || ''
    if (!visitor_id) {
      visitor_id = `v_${Math.random()
        .toString(16)
        .slice(2)}_${Date.now().toString(16)}`
      localStorage.setItem(VISITOR_KEY, visitor_id)
    }
  } catch (_) {
    visitor_id = `v_${Math.random()
      .toString(16)
      .slice(2)}_${Date.now().toString(16)}`
  }

  // Session id (per page load)
  const session_id = `s_${Math.random()
    .toString(16)
    .slice(2)}_${Date.now().toString(16)}`

  const utm = {
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
    term: params.get('utm_term') || '',
    content: params.get('utm_content') || ''
  }

  return {
    visitor_id,
    session_id,
    referrer: document.referrer || '',
    landing_path: window.location.pathname || '',
    utm,
    ts: new Date().toISOString(),
    tz: String(new Date().getTimezoneOffset()),
    lang: navigator.language || '',
    viewport: { w: window.innerWidth || 0, h: window.innerHeight || 0 }
  }
}
