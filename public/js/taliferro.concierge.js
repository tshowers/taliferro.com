import {
  state,
  CONCIERGE_ENDPOINT,
  CONCIERGE_FALLBACK_ENDPOINT,
  withBatchRender
} from 'https://taliferro.com/js/taliferro.shared.js'

import { modulesSummaryForApi } from 'https://taliferro.com/js/taliferro.payload.js'
import {
  setChoices,
  setRevealed,
  setPrimaryCtas,
  pushMessage,
  lockPromptRotation,
  render
} from 'https://taliferro.com/js/taliferro.ui.js'
import { localRelevantModuleIds } from 'https://taliferro.com/js/taliferro.relevance.js'

// ---------------------------------------------------------------------------
// GA4 events (best-effort). Safe: never breaks UX.
// ---------------------------------------------------------------------------
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

const CANONICAL_DEFINITIONS = {
  TODD: 'TODD stands for Tactical Outreach and Data Development.',
  BMS: 'BMS stands for Momentum System.',

  'Taliferro Group':
    'Taliferro Group is the services arm of Taliferro Tech, LLC. It provides consulting in web development, web security, e‑commerce, Agile coaching, APIs/integration, cloud, AI, and machine learning.',

  'Taliferro Tech':
    'Taliferro Tech builds software products. Key products include a Laboratory Information System and TODD (a Momentum System).',

  Network:
    'Network is TODD’s contact module: manage contacts with automated data cleanup, enrichment, and email validation.',

  Outreach:
    'Outreach is TODD’s email module: draft emails, run campaigns, and stay on top of follow‑ups.',

  Pulse:
    'Pulse is TODD’s survey module: collect feedback and signals through surveys.',

  Moves:
    'Moves is TODD’s task and project module: outcome‑linked tasks tied to outreach, proposals, or data work.',

  Docs: 'Docs is TODD’s document and knowledge module: store documents and keep notes organized.',

  MatchMaker:
    'MatchMaker pairs primes and subs (or partners) using NAICS codes, categories, and certifications.',

  Glossary: 'TODD Help and Glossary: https://todd.taliferro.tech/help'
}

async function postJson (url, payload, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

function isQuestionLike (txt) {
  const t = String(txt || '').trim()
  if (!t) return false
  if (t.endsWith('?')) return true
  return /^(are|do|does|did|can|could|would|will|should|what|why|how|where|when|which)\b/i.test(
    t
  )
}

function isDefinitionQuery (txt) {
  const t = String(txt || '').toLowerCase()
  return (
    t.includes('what is todd') ||
    t.includes('what’s todd') ||
    t.includes('whats todd') ||
    t.includes('what is bms') ||
    t.includes('what’s bms') ||
    t.includes('whats bms')
  )
}

function countVisitorMessages () {
  return (state.messages || []).filter(
    m => m && m.role === 'visitor' && String(m.text || '').trim()
  ).length
}

function computeSalesStage ({
  visitorCount,
  selectionValue,
  lastVisitorText,
  hasOfferedCall
}) {
  const t = String(lastVisitorText || '').toLowerCase()

  // Buying intent / closing cues
  const closeCues = [
    'yes',
    'call',
    'phone',
    'email',
    'book',
    'demo',
    'price',
    'pricing',
    'cost',
    'quote',
    'proposal',
    'schedule'
  ]
  const hasCloseCue = closeCues.some(w => t.includes(w))

  // If we've already offered a call or the visitor shows strong intent, shift to close.
  if (hasOfferedCall || hasCloseCue) {
    return {
      stage: 'close',
      reason: hasOfferedCall ? 'call offered' : 'buying-intent cue'
    }
  }

  // If they selected a topic but haven't typed yet, keep it captivate (one strong prompt + ask).
  if (selectionValue && visitorCount === 0) {
    return { stage: 'captivate', reason: 'topic selected, no detail yet' }
  }

  // 1st real message: fascinate (tight reflection + one intriguing narrowing question)
  if (visitorCount === 1) {
    return { stage: 'fascinate', reason: 'first visitor detail' }
  }

  // 2+ messages: educate (supporting shelves + deeper narrowing)
  if (visitorCount >= 2) {
    return { stage: 'educate', reason: 'enough signal for recommendations' }
  }

  // Default
  return { stage: 'captivate', reason: 'default' }
}

function makeReflection ({ eventType, selectionLabel, visitorText }) {
  const label = String(selectionLabel || '').trim()
  const vt = String(visitorText || '').trim()

  // Circle click (no free text yet)
  if (!vt && label) {
    return `Got it — ${label}. Give me one detail and I’ll narrow this down.`
  }

  // Free text (with or without a circle)
  if (vt) {
    if (label) {
      return `Got it — ${label}. I’m going to narrow this to the most likely fixes.`
    }
    return `Got it. I’m going to narrow this to the most likely fixes.`
  }

  // Fallback
  if (eventType) {
    return `Got it. I’m pulling the most relevant options now.`
  }
  return ''
}

function applyLocalConciergeFallback (eventType) {
  const local = localRelevantModuleIds()
  const visitorCount = countVisitorMessages()

  withBatchRender(() => {
    state.prompt = 'I pulled a few useful places to start.'
    lockPromptRotation()

    pushMessage(
      'guide',
      'I’m showing the best Taliferro resources I can match right now.'
    )

    setRevealed(local)

    setChoices([
      { label: 'Outreach + follow-ups', value: 'outreach' },
      { label: 'Cloud + systems', value: 'cloud' },
      { label: 'APIs + integration', value: 'apis' }
    ])

    if (visitorCount >= 1) {
      setPrimaryCtas([
        { kind: 'book', label: 'Book a meeting' },
        { kind: 'email', label: 'Email us' }
      ])
    } else {
      setPrimaryCtas([])
    }
  }, render)

  ga('concierge_local_fallback_shown', {
    event_type: eventType,
    sales_stage: state.salesStage || '',
    entry_intent: state.entryIntent || '',
    selection_value: state.lastSelectedChoiceValue || '',
    reveal_count: local.length
  })
}

function applyConciergeResponse (data) {
  if (!data || typeof data !== 'object') return

  const sayText = data.say ? String(data.say) : ''
  const askText = data.ask ? String(data.ask) : ''
  const headline =
    askText && askText.trim() ? askText.trim() : (sayText || '').trim()

  const lastVisitorMsg = (state.messages || [])
    .slice()
    .reverse()
    .find(m => m && m.role === 'visitor' && String(m.text || '').trim())

  const visitorText = lastVisitorMsg ? String(lastVisitorMsg.text || '') : ''

  if (isDefinitionQuery(visitorText)) {
    const upper = visitorText.toUpperCase()
    if (upper.includes('TODD')) pushMessage('guide', CANONICAL_DEFINITIONS.TODD)
    if (upper.includes('BMS')) pushMessage('guide', CANONICAL_DEFINITIONS.MS)
  }

  const visitorCount = countVisitorMessages()
  const lastVisitor = (state.messages || [])
    .slice()
    .reverse()
    .find(m => m && m.role === 'visitor')
  const reflection = makeReflection({
    eventType: state.lastEventType,
    selectionLabel: state.lastSelectedChoice || '',
    visitorText: lastVisitor ? lastVisitor.text : ''
  })

  withBatchRender(() => {
    state.prompt = headline
    lockPromptRotation()

    // Expert reflection keeps the visitor in dialog. Keep it short.
    if (reflection) {
      pushMessage('guide', reflection)
    }

    if (
      sayText &&
      sayText.trim() &&
      sayText.trim() !== headline &&
      !isQuestionLike(sayText)
    ) {
      pushMessage('guide', sayText)
    }

    if (Array.isArray(data.choices)) {
      setChoices(
        data.choices
          .filter(c => c && c.label && c.value)
          .slice(0, 3)
          .map(c => ({ label: String(c.label), value: String(c.value) }))
      )
    } else setChoices([])

    // Reveal: keep shelves rich and responsive.
    // If backend returns a small list, pad with local relevance (deduped).
    if (Array.isArray(data.reveal) && data.reveal.length) {
      const primary = data.reveal.map(String)
      const didPad = primary.length < 6
      const selectionValue = String(state.lastSelectedChoiceValue || '')
      const hasVisitorMsg = !!lastVisitorMsg

      // If we're going to pad anyway, keep web_dev clean on first click by relying on local relevance.
      const ignorePrimary =
        selectionValue === 'web_dev' && didPad && !hasVisitorMsg

      const local = didPad ? localRelevantModuleIds() : []
      const padded = ignorePrimary
        ? local
        : didPad
        ? Array.from(new Set([...primary, ...local]))
        : primary

      setRevealed(padded)
    } else {
      const local = localRelevantModuleIds()
      setRevealed(local)
    }

    // Delay CTAs until the visitor has provided enough signal.
    // Keeps them in dialog before pushing call/email.
    const canShowCtas = visitorCount >= 2

    // Closing beat (only once): invite a quick call after we have enough context.
    const hasPhoneCta =
      Array.isArray(data.cta) &&
      data.cta.some(c => c && c.kind === 'phone' && c.label)

    if (canShowCtas && hasPhoneCta && !state.hasOfferedCall) {
      pushMessage(
        'guide',
        'If you want, we can finish this together on a quick call. Yes or no?'
      )
      state.hasOfferedCall = true

      ga('home_call_offer_shown', {
        sales_stage: state.salesStage || '',
        entry_intent: state.entryIntent || '',
        selection_value: state.lastSelectedChoiceValue || ''
      })

      // Arm call-offer state machine so the next visitor input can be interpreted as yes/no.
      state.callOfferPending = true
      state.callOfferAnswer = ''
      state.callOfferAskedAt = Date.now()
    }

    if (canShowCtas && Array.isArray(data.cta)) {
      setPrimaryCtas(
        data.cta
          .filter(c => c && c.kind && c.label)
          .map(c => ({
            kind: String(c.kind),
            label: String(c.label),
            phone: typeof c.phone === 'string' ? c.phone : undefined
          }))
      )
    } else {
      setPrimaryCtas([])
    }
  }, render)
}

export async function callConcierge (eventType) {
  state.requestSeq += 1
  const mySeq = state.requestSeq
  state.activeRequestSeq = mySeq

  if (state.abortController) {
    try {
      state.abortController.abort()
    } catch (_) {}
  }
  state.abortController = new AbortController()

  state.isCalling = true
  state.loadingLabel =
    eventType === 'reply'
      ? 'Processing your response . . .'
      : 'Pulling the most relevant options…'
  render()
  state.lastError = ''
  state.lastEventType = eventType

  const visitorCount = countVisitorMessages()
  const lastVisitorMsg = (state.messages || [])
    .slice()
    .reverse()
    .find(m => m && m.role === 'visitor' && String(m.text || '').trim())

  const stageInfo = computeSalesStage({
    visitorCount,
    selectionValue: state.lastSelectedChoiceValue || '',
    lastVisitorText: lastVisitorMsg ? lastVisitorMsg.text : '',
    hasOfferedCall: !!state.hasOfferedCall
  })

  state.salesStage = stageInfo.stage
  state.salesStageReason = stageInfo.reason
  state.salesStageUpdatedAt = Date.now()

  const payload = {
    eventType,
    salesStage: state.salesStage,
    salesStageReason: state.salesStageReason,
    meta: state.meta || {},
    entry: {
      intent: state.entryIntent || '',
      source: state.entrySource || '',
      page: state.entryPage || ''
    },
    selection: {
      label: state.lastSelectedChoice || '',
      value: state.lastSelectedChoiceValue || ''
    },
    messages: (state.messages || []).slice(-12),
    revealed: state.revealed || [],
    modules: modulesSummaryForApi()
  }

  ga('concierge_request_start', {
    event_type: eventType,
    sales_stage: state.salesStage || '',
    sales_stage_reason: state.salesStageReason || '',
    entry_intent: state.entryIntent || '',
    selection_value: state.lastSelectedChoiceValue || ''
  })

  try {
    let data
    const host = window.location.hostname
    const isLocal = host === 'localhost' || host === '127.0.0.1'

    if (isLocal) {
      data = await postJson(
        CONCIERGE_FALLBACK_ENDPOINT,
        payload,
        state.abortController.signal
      )
    } else {
      try {
        data = await postJson(
          CONCIERGE_ENDPOINT,
          payload,
          state.abortController.signal
        )
      } catch (_) {
        data = await postJson(
          CONCIERGE_FALLBACK_ENDPOINT,
          payload,
          state.abortController.signal
        )
      }
    }

    applyConciergeResponse(data)

    ga('concierge_request_success', {
      event_type: eventType,
      sales_stage: state.salesStage || '',
      entry_intent: state.entryIntent || '',
      has_choices: Array.isArray(data?.choices) && data.choices.length ? 1 : 0,
      reveal_count: Array.isArray(data?.reveal) ? data.reveal.length : 0,
      cta_count: Array.isArray(data?.cta) ? data.cta.length : 0
    })
  } catch (err) {
    if (state.activeRequestSeq === mySeq) state.loadingLabel = ''
    if (
      err &&
      (err.name === 'AbortError' || String(err).includes('AbortError'))
    )
      return

    state.lastError = 'Concierge call failed'

    ga('concierge_request_error', {
      event_type: eventType,
      sales_stage: state.salesStage || '',
      entry_intent: state.entryIntent || '',
      message: String(err?.message || err || '').slice(0, 120)
    })

    applyLocalConciergeFallback(eventType)
  } finally {
    if (state.activeRequestSeq === mySeq) {
      state.isCalling = false
      state.loadingLabel = ''
      render()
    }
  }
}
