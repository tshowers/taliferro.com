import { state, SEED_GUIDE_TEXT, getMeta } from 'https://taliferro.com/js/taliferro.shared.js'
import { setModules } from 'https://taliferro.com/js/taliferro.modules.js'
import {
  render,
  startPromptRotation,
  closeModal,
  openVideoModal,
  lockPromptRotation,
  clearSeedGuideIfPresent,
  setRevealed
} from 'https://taliferro.com/js/taliferro.ui.js'
import { localRelevantModuleIds } from 'https://taliferro.com/js/taliferro.relevance.js'

import { callConcierge } from 'https://taliferro.com/js/taliferro.concierge.js'

function ga (name, params = {}) {
  try {
    if (typeof window.gtag !== 'function') return
    window.gtag('event', String(name), {
      event_category: 'taliferro_home',
      ...params
    })
  } catch {
    // swallow
  }
}

function gaOnceFactory () {
  const fired = new Set()
  return (key, name, params = {}) => {
    if (fired.has(key)) return
    fired.add(key)
    ga(name, params)
  }
}

const gaOnce = gaOnceFactory()

async function onChoice (choice) {
  state.lastSelectedChoice = choice.label
  state.lastSelectedChoiceValue = choice.value

  // Clear shelves immediately so the visitor can't interact with stale results.
  setRevealed([])

  state.hasInteracted = true
  clearSeedGuideIfPresent()
  lockPromptRotation()

  // Show spinner + working copy immediately.
  state.isCalling = true
  state.loadingLabel = 'Pulling the most relevant options…'
  render()

  ga('home_choice_selected', {
    choice_label: choice.label,
    choice_value: choice.value,
    entry_intent: state.entryIntent || ''
  })

  await callConcierge('reply')
  ga('concierge_response_received', {
    choice_value: choice.value,
    sales_stage: state.salesStage || '',
    sales_stage_reason: state.salesStageReason || ''
  })

}

function boot () {
  // 1) Modules registry (generated)
  if (Array.isArray(window.TALIFERRO_MODULES))
    setModules(window.TALIFERRO_MODULES)
  else setModules([])

  // 2) Visitor meta
  state.meta = getMeta()

  // Entry intent (preferred: sessionStorage handoff, fallback: URL params)
  let entryIntent = ''
  let entrySource = ''
  let entryPage = ''
  let entryQ = ''

  // 1) Preferred: sessionStorage handoff from .js-cta links
  try {
    const raw = sessionStorage.getItem('talf_cta')
    if (window?.TALIFERRO_TELEMETRY_DEBUG) console.log('Passed Value', raw)

    if (raw) {
      // Keep a copy for debugging/verification (non-functional; safe)
      try {
        sessionStorage.setItem('talf_cta_last', raw)
      } catch (_) {}

      const parsed = JSON.parse(raw)
      entryIntent = String(parsed?.intent || '')
        .trim()
        .toLowerCase()
      entrySource = String(parsed?.source || '')
        .trim()
        .toLowerCase()
      entryPage = String(parsed?.page || '')
        .trim()
        .toLowerCase()
      entryQ = String(parsed?.q || '').trim()

      // Expose for quick console checks
      try {
        state.entryHandoff = {
          intent: entryIntent,
          source: entrySource,
          page: entryPage,
          q: entryQ
        }
      } catch (_) {}

      // one-time handoff
      sessionStorage.removeItem('talf_cta')
    }
  } catch (_) {}

  // 2) Fallback: URL params (older links / email / exit-intent)
  try {
    if (!entryIntent && !entrySource && !entryPage) {
      const params = new URLSearchParams(window.location.search || '')
      entryIntent = String(params.get('intent') || '')
        .trim()
        .toLowerCase()
      entrySource = String(params.get('source') || '')
        .trim()
        .toLowerCase()
      entryPage = String(params.get('page') || '')
        .trim()
        .toLowerCase()
      entryQ = String(params.get('q') || '').trim()

      // Clean URL if it only contains tracking params (avoid duplicate indexing).
      // Keep UTMs and q intact.
      const hasTracking = !!(
        params.get('intent') ||
        params.get('source') ||
        params.get('page')
      )
      const hasUtm = !!(
        params.get('utm_source') ||
        params.get('utm_medium') ||
        params.get('utm_campaign') ||
        params.get('utm_term') ||
        params.get('utm_content')
      )
      const hasOtherMeaningful = !!params.get('q')

      if (hasTracking && !hasUtm && !hasOtherMeaningful) {
        try {
          window.history.replaceState({}, '', window.location.pathname)
        } catch (_) {}
      }
    }
  } catch (_) {}

  state.entryIntent = entryIntent
  state.entrySource = entrySource
  state.entryPage = entryPage

  // If we have an entry intent but no query, seed a better placeholder set
  try {
    if (entryIntent && !entryQ) {
      const presetExamples = {
        agile_coaching: [
          'Work keeps entering sprints half-baked',
          'Dependencies keep blocking delivery',
          'Standups create noise, not clarity',
          'Planning does not produce decisions'
        ],
        api_design: [
          'Our API design is messy',
          'Versioning keeps breaking clients',
          'Auth rules are inconsistent',
          'Docs are stale and incomplete'
        ],
        cloud_architecture: [
          'Cloud costs are creeping up',
          'Deployments are brittle',
          'No clear ownership of environments',
          'Observability is weak'
        ],
        security: [
          'Security review keeps blocking delivery',
          'Access control is inconsistent',
          'Too many manual approvals',
          'No clear audit trail'
        ],
        ai: [
          'Our AI pilot stalled',
          'We cannot evaluate outputs reliably',
          'Data quality is inconsistent',
          'Teams do not trust the results'
        ],
        ecommerce: [
          'Checkout drop-offs are high',
          'Catalog data is inconsistent',
          'Promos break pricing rules',
          'Support tickets keep repeating'
        ],
        website_development: [
          'Our website is slow',
          'SEO pages are not indexing',
          'Analytics is noisy',
          'Forms do not convert'
        ],
        bms: [
          'We are not getting leads',
          'Follow-ups keep slipping',
          'Prospects fall through cracks',
          'We cannot keep momentum'
        ],
        todd: [
          'Follow-ups keep slipping',
          'Contacts are messy',
          'We lose context across threads',
          'We need better next-step prompts'
        ]
      }

      const presetChoices = {
        agile_coaching: [
          { label: 'Work too big to land', value: 'work_too_big' },
          { label: 'Readiness is unclear', value: 'readiness' },
          { label: 'Dependencies blocking', value: 'dependencies' },
          { label: 'Standups are noise', value: 'standup_noise' }
        ]
      }

      const ex = presetExamples[entryIntent]
      if (Array.isArray(ex) && ex.length) state.exampleSet = ex.slice(0, 4)

      const ch = presetChoices[entryIntent]
      if (Array.isArray(ch) && ch.length) state.lastChoices = ch

      // Nudge placeholder so the input feels related even before prefill
      const placeholderByIntent = {
        agile_coaching: 'Type one sentence about delivery friction',
        api_design: 'Type one sentence about your API pain',
        cloud_architecture: 'Type one sentence about cloud pain',
        security: 'Type one sentence about security friction',
        ai: 'Type one sentence about your AI issue',
        ecommerce: 'Type one sentence about your e-commerce issue',
        website_development: 'Type one sentence about your website issue',
        bms: 'Type one sentence about momentum',
        todd: 'Type one sentence about what TODD should handle'
      }
      state.placeholderText =
        placeholderByIntent[entryIntent] || state.placeholderText
    }
  } catch (_) {}

  gaOnce('entry', 'home_entry', {
    entry_intent: entryIntent || '',
    entry_source: entrySource || '',
    entry_page: entryPage || ''
  })

  const isBmsIntent = entryIntent === 'bms'
  // Optional: if we received a query (q), keep it available for UI to prefill
  if (entryQ && !state.entryQuery) state.entryQuery = entryQ

  // 3) Seed starter UX (no backend call on load)
  if (!Array.isArray(state.messages) || state.messages.length === 0) {
    if (isBmsIntent) {
      state.messages = [
        {
          role: 'guide',
          text: 'Tell me what’s stuck — I’ll map the first step.'
        }
      ]
    } else {
      state.messages = [{ role: 'guide', text: SEED_GUIDE_TEXT }]
    }
  }

  if (!Array.isArray(state.lastChoices) || state.lastChoices.length === 0) {
    if (isBmsIntent) {
      state.lastChoices = [
        { label: 'Follow-ups slipping', value: 'followups' },
        { label: 'Scattered data', value: 'scattered_data' },
        { label: 'No clear next step', value: 'next_step' }
      ]
    } else {
      state.lastChoices = [
        { label: 'AI adoption', value: 'ai' },
        { label: 'Security best practices', value: 'security' },
        { label: 'Web development', value: 'web_dev' }
      ]
    }
  }

  // 4) First paint
  render()
  gaOnce('first_paint', 'home_first_paint', { entry_intent: entryIntent || '' })

  // 5) Single delegated click handler
  document.addEventListener('click', e => {
    // modal close
    if (e.target?.closest?.('[data-modal-close]')) {
      ga('home_modal_close')
      closeModal()
      return
    }

    // card click
    const card = e.target?.closest?.('.card[data-module-id]')
    if (card) {
      const kind = card.getAttribute('data-kind') || ''
      const url = card.getAttribute('data-url') || ''
      const phone = card.getAttribute('data-phone') || ''
      ga('home_module_card_click', { kind, has_url: !!url, has_phone: !!phone })

      if (phone) {
        ga('home_phone_click', { phone })
        window.location.href = `tel:${phone}`
        return
      }

      if (kind === 'video' && url) {
        ga('home_video_open', { url })
        openVideoModal(url)
        return
      }

      if ((kind === 'url' || kind === 'pdf' || kind === 'image') && url) {
        ga('home_outbound_open', { kind, url })
        window.open(url, '_blank', 'noopener')
        return
      }
    }

    // choice click
    const btn = e.target?.closest?.('button.choice[data-choice]')
    if (btn && !state.isCalling) {
      const value = btn.getAttribute('data-choice') || ''
      ga('home_choice_click', {
        choice_value: value,
        entry_intent: state.entryIntent || ''
      })
      const choiceObj = (state.lastChoices || []).find(c => c.value === value)
      if (choiceObj) onChoice(choiceObj)
    }
  })

  // Human signals: focus + typing (helps separate real users from bots)
  document.addEventListener(
    'focusin',
    e => {
      const t = e?.target
      if (!t) return
      const tag = String(t.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') {
        gaOnce('home_input_focus', 'home_input_focus', {
          entry_intent: state.entryIntent || ''
        })
      }
    },
    { passive: true }
  )

  document.addEventListener(
    'input',
    e => {
      const t = e?.target
      if (!t) return
      const tag = String(t.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') {
        gaOnce('home_typing', 'home_typing', {
          entry_intent: state.entryIntent || ''
        })
      }
    },
    { passive: true }
  )

  // Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal()
  })

  // Optional: scroll depth milestones
  ;(() => {
    const marks = new Set([25, 50, 75, 100])
    const handler = () => {
      const h = document.documentElement
      const max = (h.scrollHeight || 0) - (h.clientHeight || 0)
      if (max <= 0) return
      const pct = Math.min(
        100,
        Math.max(0, Math.round((h.scrollTop / max) * 100))
      )
      for (const m of [...marks]) {
        if (pct >= m) {
          marks.delete(m)
          ga('home_scroll_depth', { percent: m })
        }
      }
      if (marks.size === 0) window.removeEventListener('scroll', handler)
    }
    window.addEventListener('scroll', handler, { passive: true })
  })()

  if (isBmsIntent) {
    // Keep BMS entry prompt stable (don’t rotate away from it).
    lockPromptRotation()
  } else {
    // 6) Start rotating prompt until engagement
    startPromptRotation()
  }
}

function runBootOnce () {
  // Avoid double-boot
  if (window.__taliferroBootRan) return
  window.__taliferroBootRan = true

  try {
    boot()
  } catch (e) {
    // Surface boot errors in a way Safari will show
    try {
      console.error('[taliferro.boot] boot() failed', e)
    } catch (_) {}

    // Best-effort visible fallback
    try {
      const el = document.getElementById('appRight')
      if (el) {
        el.insertAdjacentHTML(
          'afterbegin',
          '<div style="padding:12px;border:1px solid rgba(0,0,0,.15);border-radius:12px;margin-bottom:10px">' +
            '<strong>Quick guidance failed to start.</strong><br>' +
            '<span style="font-size:12px;opacity:.8">Check Safari Console for details.</span>' +
            '</div>'
        )
      }
    } catch (_) {}
  }
}

// Safari can execute module scripts after DOMContentLoaded has already fired.
// So we run immediately when possible, otherwise wait for DOM readiness.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runBootOnce, { once: true })
} else {
  // DOM is already ready
  runBootOnce()
}

// Extra safety: in case of bfcache / odd timing, try again on pageshow
window.addEventListener(
  'pageshow',
  () => {
    runBootOnce()
  },
  { once: true }
)
