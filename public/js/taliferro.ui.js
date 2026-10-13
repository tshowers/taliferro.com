import {
  state,
  SUPPRESS_RENDER,
  TYPE_TITLES,
  SEED_GUIDE_TEXT,
  ROTATE_MS,
  ROTATING_PROMPTS,
  assetPath,
  escapeHtml,
  uniq
} from 'https://taliferro.com/js/taliferro.shared.js'

import { getModule } from 'https://taliferro.com/js/taliferro.modules.js'
import { localRelevantModuleIds } from 'https://taliferro.com/js/taliferro.relevance.js'
import { callConcierge } from 'https://taliferro.com/js/taliferro.concierge.js'

const HOME_EXAMPLES = [
  'Our AI pilot stalled',
  'We are not getting leads',
  'Follow-ups keep slipping',
  'We have data, no insight',
  'Security review keeps blocking delivery',
  'Our API design is messy',
  'Cloud costs are creeping up',
  'We built it. No one uses it'
]

const DEFAULT_CHOICES = [
  { value: 'ai_adoption', label: 'AI adoption' },
  { value: 'security', label: 'Security best practices' },
  { value: 'web_development', label: 'Web development' },
  { value: 'api_integration', label: 'API integration' },
  { value: 'cloud_architecture', label: 'Cloud architecture' },
  { value: 'data_insight', label: 'Data, no insight' },
  { value: 'followups', label: 'Follow-ups slipping' }
]

const FALLBACK_THUMB = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#f4f6fb"/>
    <rect x="32" y="32" width="576" height="296" rx="28" fill="#ffffff" stroke="#d9e1ee"/>
    <text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#243b63">Taliferro</text>
    <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#6b7280">Resource preview</text>
  </svg>
`)}`

function pickExampleSet (count = 4) {
  const arr = [...HOME_EXAMPLES]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.max(1, count))
}

function nextRotatingPlaceholder (current) {
  const idx = HOME_EXAMPLES.indexOf(String(current || ''))
  const next = HOME_EXAMPLES[(idx + 1) % HOME_EXAMPLES.length]
  return next || HOME_EXAMPLES[0]
}

// Progressive interaction defaults (safe even if shared state already has values)
if (!state.exampleSet) state.exampleSet = pickExampleSet(4)
if (!state.placeholderText) state.placeholderText = HOME_EXAMPLES[0]
if (!('placeholderTimer' in state)) state.placeholderTimer = null

export function clearSeedGuideIfPresent () {
  if (!Array.isArray(state.messages) || state.messages.length === 0) return
  const first = state.messages[0]
  if (
    first &&
    first.role === 'guide' &&
    String(first.text || '').trim() === SEED_GUIDE_TEXT
  ) {
    state.messages = state.messages.slice(1)
  }
}

export function pushMessage (role, text) {
  const t = String(text ?? '').trim()
  if (!t) return

  if (role === 'guide') {
    // Find the most recent guide message (visitor messages may be stored in between).
    const lastGuide = (state.messages || [])
      .slice()
      .reverse()
      .find(m => m && m.role === 'guide')
    if (lastGuide && String(lastGuide.text || '').trim() === t) {
      return
    }

    // If the immediately previous message is also guide, replace it.
    const last = state.messages[state.messages.length - 1]
    if (last && last.role === 'guide') {
      last.text = t
      if (!SUPPRESS_RENDER) render()
      return
    }
  }

  state.messages.push({ role, text: t })
  if (!SUPPRESS_RENDER) render()
}

export function setRevealed (ids) {
  state.revealed = uniq(ids)
  if (!SUPPRESS_RENDER) render()
}

export function setChoices (choices) {
  state.lastChoices = Array.isArray(choices) ? choices : []
  if (!SUPPRESS_RENDER) render()
}

export function setPrimaryCtas (cta) {
  state.cta = Array.isArray(cta) ? cta : []
  if (!SUPPRESS_RENDER) render()
}

export function updatePromptTextOnly (text) {
  const mount = document.getElementById('promptMount')
  if (!mount) return
  const promptEl = mount.querySelector('.prompt')
  const safe =
    String(text ?? '').trim() || 'Pick a category below, or type one sentence.'
  if (promptEl) promptEl.textContent = safe
  else mount.innerHTML = `<div class="prompt">${escapeHtml(safe)}</div>`
}

// ----- Rotation -----
export function stopPromptRotation () {
  if (state.rotateTimer) {
    try {
      window.clearInterval(state.rotateTimer)
    } catch (_) {}
  }
  state.rotateTimer = null
}

export function lockPromptRotation () {
  state.rotateLocked = true
  stopPromptRotation()
}

export function startPromptRotation () {
  if (state.rotateLocked) return
  if (state.hasInteracted) return

  if (!state.prompt) {
    state.rotateIndex = 0
    state.prompt = ROTATING_PROMPTS[0]
    updatePromptTextOnly(state.prompt)
  }

  stopPromptRotation()
  state.rotateTimer = window.setInterval(() => {
    if (state.rotateLocked) return
    if (state.hasInteracted) return
    if (state.isCalling) return

    state.rotateIndex = (state.rotateIndex + 1) % ROTATING_PROMPTS.length
    state.prompt = ROTATING_PROMPTS[state.rotateIndex]
    updatePromptTextOnly(state.prompt)
  }, ROTATE_MS)
}

// ----- Modal (video) -----
function toEmbedUrl (u) {
  const url = String(u || '').trim()
  if (!url) return ''
  if (url.includes('youtube.com/watch')) {
    try {
      const parsed = new URL(url)
      const v = parsed.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
    } catch {}
  }
  // youtube.com/shorts/<id>
  if (url.includes('youtube.com/shorts/')) {
    const id = url.split('youtube.com/shorts/')[1]?.split(/[?&#/]/)[0]
    if (id) return `https://www.youtube.com/embed/${id}`
  }
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split(/[?&#]/)[0]
    if (id) return `https://www.youtube.com/embed/${id}`
  }
  if (url.includes('youtube.com/embed/')) return url
  return url
}

function youtubeIdFromUrl (u) {
  const url = String(u || '').trim()
  if (!url) return ''

  // youtube.com/watch?v=
  if (url.includes('youtube.com/watch')) {
    try {
      const parsed = new URL(url)
      const v = parsed.searchParams.get('v')
      return v || ''
    } catch (_) {
      return ''
    }
  }

  // youtube.com/shorts/<id>
  if (url.includes('youtube.com/shorts/')) {
    return url.split('youtube.com/shorts/')[1]?.split(/[?&#/]/)[0] || ''
  }

  // youtube.com/embed/<id>
  if (url.includes('youtube.com/embed/')) {
    return url.split('youtube.com/embed/')[1]?.split(/[?&#/]/)[0] || ''
  }

  // youtu.be/<id>
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1]?.split(/[?&#/]/)[0] || ''
  }

  return ''
}

function youtubeThumbUrl (u) {
  const id = youtubeIdFromUrl(u)
  if (!id) return ''
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
}

export function openVideoModal (videoUrl) {
  const root = document.getElementById('modalRoot')
  if (!root) return
  const src = toEmbedUrl(videoUrl)
  root.innerHTML = `
    <div class="modalBackdrop" data-modal-close="1"></div>
    <div class="modalCard">
      <div class="modalInner">
        <button class="modalClose" data-modal-close="1">×</button>
        <div class="modalVideo">
          <iframe src="${src}" allowfullscreen></iframe>
        </div>
      </div>
    </div>
  `
}

export function closeModal () {
  const root = document.getElementById('modalRoot')
  if (root) root.innerHTML = ''
}

// ----- Cards -----
function renderModuleCard (m) {
  if (!m) return ''

  const kind = m.asset?.kind
  const url = m.asset?.url || ''
  const phone = m.asset?.phone || ''

  const isImage = kind === 'image' && url
  const isVideo = kind === 'video' && url

  // Improved displayTitle/desc logic
  const titleText =
    m.title && String(m.title).trim() ? String(m.title).trim() : ''
  const descTextRaw =
    m.description && String(m.description).trim()
      ? String(m.description).trim()
      : ''

  // Title uses m.title when present; otherwise a short slice of description.
  const displayTitle =
    titleText || (descTextRaw ? descTextRaw.slice(0, 72) : m.type)

  // Avoid duplicated title/description rendering.
  // If description is the same as the title (or starts with it), omit the description.
  const descText = !descTextRaw
    ? ''
    : descTextRaw === displayTitle || descTextRaw.startsWith(displayTitle)
    ? ''
    : descTextRaw

  let thumbSrc = ''

  // Prefer explicit thumb_url if provided
  if (m.thumb_url) {
    thumbSrc = String(m.thumb_url).trim()
  } else if (isImage && url) {
    thumbSrc = String(url).trim()
  } else if (isVideo && url) {
    thumbSrc = youtubeThumbUrl(url)
  } else if (url && url.toLowerCase().endsWith('.pdf')) {
    // Assume a matching .webp image exists in /img with the same base filename
    try {
      const pdfName = url.split('/').pop()
      const imageName = pdfName.replace(/\.pdf$/i, '.webp')
      thumbSrc = assetPath(`https://taliferro.com/img/${imageName}`)
    } catch (_) {}
  }

  const fallbackThumb = escapeHtml(FALLBACK_THUMB)
  const thumbHtml = thumbSrc
    ? `<img class="thumb" src="${escapeHtml(
        thumbSrc
      )}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallbackThumb}';this.classList.add('thumbFallback')">`
    : ''

  let dataAttrs = `data-module-id="${escapeHtml(
    m.module_id
  )}" data-kind="${escapeHtml(kind || '')}"`
  if (url) dataAttrs += ` data-url="${escapeHtml(url)}"`
  if (phone) dataAttrs += ` data-phone="${escapeHtml(phone)}"`

  if (isImage) {
    return `
      <div class="card${thumbHtml ? '' : ' noThumb'}" ${dataAttrs}>
        ${thumbHtml}
        <div class="cardTop"><div class="title">${escapeHtml(
          displayTitle
        )}</div></div>
      </div>
    `
  }

  const badge = `<span class="badge">${escapeHtml(m.type)}</span>`
  const title = `<div class="title">${escapeHtml(displayTitle)}</div>`
  const desc = descText ? `<div class="desc">${escapeHtml(descText)}</div>` : ''

  return `
    <div class="card${thumbHtml ? '' : ' noThumb'}" ${dataAttrs}>
      ${thumbHtml}
      <div class="cardTop">${badge}${title}</div>
      ${desc}
    </div>
  `
}

export function render () {
  const appRight = document.getElementById('appRight')
  const appBelow = document.getElementById('appBelow')
  if (!appRight || !appBelow) return

  // Track calling state so we can detect "finished" transitions
  // (Bugfix: key should not include a leading dot)
  if (!('_wasCallingInit' in state)) {
    state._wasCallingInit = true
    state._wasCalling = Boolean(state.isCalling)
  }

  // Debug logging (local only)
  const _debugScroll =
    location.hostname === '127.0.0.1' ||
    location.hostname === 'localhost' ||
    location.hostname === '0.0.0.0' ||
    location.hostname === '[::1]' ||
    location.protocol === 'file:'

  const _scrollLog = (...args) => {
    if (!_debugScroll) return
    try {
      console.debug('[auto-scroll]', ...args)
    } catch (_) {}
  }

  const guideMessages = (state.messages || []).filter(
    m => m && m.role === 'guide'
  )
  const messagesHtml = guideMessages
    .slice(-3)
    .map(m => `<div class="msg guide">${escapeHtml(m.text)}</div>`)
    .join('')

  const promptHtml = state.prompt
    ? `<div class="prompt">${escapeHtml(state.prompt)}</div>`
    : ''

  const loadingHtml = state.isCalling
    ? `<div class="loadingNotice"><span class="spinner" aria-hidden="true"></span>${escapeHtml(
        state.loadingLabel || 'Loading…'
      )}</div>`
    : ''

  const disabledAttr = state.isCalling ? 'disabled' : ''
  const inputRowHtml = state.isCalling
    ? ''
    : `
      <div class="inputRow">
        <input id="freeText" class="freeText" placeholder="${escapeHtml(
          state.placeholderText || 'Type what’s stuck (optional)'
        )}" />
        <button id="sendBtn" class="sendBtn iconBtn" type="button" aria-label="Send" ${
          state.isCalling ? 'disabled' : ''
        }>
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>
    `

  const exampleRowHtml = state.isCalling
    ? ''
    : `
      <div class="exampleRow" aria-label="Examples">
        ${(state.exampleSet || [])
          .map(
            t =>
              `<button class="exampleChip" type="button" data-example="${escapeHtml(
                t
              )}">${escapeHtml(t)}</button>`
          )
          .join('')}
      </div>
    `
  // Choices (category circles)
  // Choices (category buttons)
  const baseChoices = Array.isArray(state.lastChoices) ? state.lastChoices : []
  const choicesForUi = baseChoices.length ? baseChoices : DEFAULT_CHOICES

  const choicesHtml = choicesForUi
    .map(
      c =>
        `<button class="choice categoryBtn" ${disabledAttr} type="button" data-choice="${escapeHtml(
          c.value
        )}">${escapeHtml(c.label)}</button>`
    )
    .join('')

  const revealedModules = state.revealed.map(getModule).filter(Boolean)
  const byType = revealedModules.reduce((acc, m) => {
    acc[m.type] = acc[m.type] || []
    acc[m.type].push(m)
    return acc
  }, {})

  const shelfOrder = [
    'explainer',
    'video',
    'testimonial',
    'product',
    'service',
    'feature',
    'image',
    'case-study',
    'blog',
    'page-preview',
    'brochure',
    'pricing',
    'cta'
  ]

  const SHELF_SUMMARY = {
    explainer: 'A quick orientation so you know what’s here.',
    video: 'Short clips that explain the idea fast.',
    image: 'A quick gallery you can scan in seconds.',
    'case-study': 'Real examples and outcomes from teams we’ve helped.',
    blog: 'Deeper write-ups with details and context.',
    'page-preview': 'Hand-picked pages worth reading next.',
    testimonial: 'How people describe the experience.',
    service: 'Ways we can help directly.',
    product: 'Tools and systems we build and ship.',
    feature: 'Capabilities we bring to the table.'
  }

  const ctas = (state.cta || [])
    .map(c => {
      if (c.kind === 'phone' && c.phone) {
        return `<a class="ctaBtn" href="tel:${c.phone}">Call us</a>&nsp; `
      }
      if (c.kind === 'waitlist') {
        return `<a class="ctaBtn" href="mailto:info@taliferro.com?subject=${encodeURIComponent(
          'Taliferro — Question'
        )}">Email us</a>`
      }
      return ''
    })
    .join('')

  const topCtasMount = document.getElementById('topCtas')
  if (topCtasMount) topCtasMount.innerHTML = ctas || ''

  const shelvesHtml = state.isCalling
    ? ''
    : shelfOrder
        .filter(t => byType[t] && byType[t].length)
        .map(t => {
          const cards = byType[t].slice(0, 3).map(renderModuleCard).join('')
          return `
            <section class="shelf">
              <div class="shelfHead">
                <div class="shelfTitle">${escapeHtml(
                  TYPE_TITLES[t] || t.replace(/_/g, ' ')
                )}</div>
                <div class="shelfSummary">${escapeHtml(
                  SHELF_SUMMARY[t] || ''
                )}</div>
              </div>
              <div class="shelfGrid">${cards}</div>
            </section>
          `
        })
        .join('')

  appRight.innerHTML = `
    <div class="dialog">
      <div class="microCopy">Most teams get stuck in outreach, AI adoption, or execution. Type what’s stuck — or tap a recommendation.</div>
      <div class="promptMount" id="promptMount">${promptHtml}</div>
      ${loadingHtml}

      ${inputRowHtml}

      ${exampleRowHtml}

      <div class="nextSteps" aria-label="What happens next">
        <div class="nextTitle">What happens next</div>
        <ul class="nextList">
          <li>I’ll ask 1–2 quick questions</li>
          <li>I’ll map the next step</li>
          <li>No sales pitch</li>
        </ul>
      </div>

      <div class="messages" id="messages">${messagesHtml}</div>
    </div>
  `

  const belowLoadingHtml = state.isCalling
    ? `<div class="loadingNotice"><span class="spinner" aria-hidden="true"></span>${escapeHtml(
        state.loadingLabel || 'Working…'
      )}</div>`
    : ''

  appBelow.innerHTML = `
  ${belowLoadingHtml}
  <div class="choices" id="choices">${choicesHtml}</div>
  <div class="shelves" id="shelves">${shelvesHtml}</div>
`

  // Auto-scroll down when processing finishes (so results are visible)
  try {
    const wasCalling = Boolean(state._wasCalling)
    const isCallingNow = Boolean(state.isCalling)
    state._wasCalling = isCallingNow

    _scrollLog('render', {
      wasCalling,
      isCallingNow,
      revealedCount: (state.revealed || []).length
    })

    // Only scroll on the transition: calling -> finished
    if (wasCalling && !isCallingNow) {
      const hasResults = Boolean(state.revealed && state.revealed.length)
      _scrollLog('finished', { hasResults })

      if (hasResults) {
        // Give the DOM a beat to paint before scrolling
        window.requestAnimationFrame(() => {
          setTimeout(() => {
            const shelvesEl = document.getElementById('shelves')
            const appBelowEl = document.getElementById('appBelow')
            const firstShelf = shelvesEl?.querySelector?.('.shelf')
            const target = firstShelf || shelvesEl || appBelowEl

            if (!target) {
              _scrollLog('no target found', {
                hasShelves: Boolean(shelvesEl),
                hasAppBelow: Boolean(appBelowEl)
              })
              return
            }

            _scrollLog('scrolling to', {
              id: target.id || '(no id)',
              className: String(target.className || '')
            })

            if (typeof target.scrollIntoView === 'function') {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } else {
              _scrollLog('scrollIntoView not supported on target')
            }
          }, 80)
        })
      }
    }
  } catch (e) {
    _scrollLog('error', e)
  }
  const sendBtn = document.getElementById('sendBtn')
  const freeText = document.getElementById('freeText')
  if (sendBtn && freeText) {
    // Entry intent from URL (supports exit-intent handoff)
    if (!state._entryPrefillDone) {
      state._entryPrefillDone = true
      try {
        const params = new URLSearchParams(window.location.search || '')
        const intent = String(
          params.get('intent') || state.entryIntent || ''
        ).trim()
        const source = String(
          params.get('source') || state.entrySource || ''
        ).trim()
        const page = String(params.get('page') || state.entryPage || '').trim()
        const q = String(params.get('q') || state.entryQuery || '').trim()

        // Persist entry metadata if not already set elsewhere
        if (intent && !state.entryIntent) state.entryIntent = intent
        if (source && !state.entrySource) state.entrySource = source
        if (page && !state.entryPage) state.entryPage = page

        // Intent helpers (used when q is empty)
        const intentLabel =
          {
            agile_coaching: 'agile',
            api_design: 'API',
            ai: 'AI',
            ecommerce: 'e-commerce',
            website_development: 'web',
            cloud_architecture: 'cloud',
            security: 'security',
            todd: 'TODD',
            bms: 'momentum',
            general: 'this'
          }[intent] || 'this'

        const starterByIntent = {
          agile_coaching: 'Our delivery rhythm is messy',
          api_design: 'Our API design is messy',
          ai: 'Our AI pilot stalled',
          ecommerce: 'Checkout drop-offs are high',
          website_development: 'Our website is slow',
          cloud_architecture: 'Cloud costs are creeping up',
          security: 'Security review keeps blocking delivery',
          todd: 'Follow-ups keep slipping',
          bms: 'We are not getting leads'
        }

        // 1) If a query (q) was provided, use it.
        if (q) {
          freeText.value = q

          // Handoff: show a confirmation heading when a query is provided.
          // Exit-intent always includes q, and email links may include q as the subject.
          if (q && (source === 'exit_intent' || source === 'email')) {
            const summary = String(q || '').trim()
            const clipped =
              summary.length > 90 ? summary.slice(0, 90) + '…' : summary

            // Keep the wording consistent across handoffs.
            const nextPrompt = `Click Send to confirm you want help with ${intentLabel}: “${clipped}”`
            state.prompt = nextPrompt
            updatePromptTextOnly(nextPrompt)
          }

          state.hasInteracted = true
          lockPromptRotation()

          // Put cursor at end and focus so it feels continuous
          try {
            freeText.focus()
            freeText.setSelectionRange(
              freeText.value.length,
              freeText.value.length
            )
          } catch (_) {}

          // If the seed guide is still present, remove it so the handoff feels clean
          try {
            clearSeedGuideIfPresent()
          } catch (_) {}

          return
        }

        // 2) If q is empty but we have an intent (CTA handoff), prefill a starter line.
        if (!q && intent && !String(freeText.value || '').trim()) {
          const starter = String(starterByIntent[intent] || '')

          // Prefer a human starter sentence (so Send does something meaningful)
          if (starter) {
            freeText.value = starter
          } else if (page) {
            // Fallback: page name if we have it
            freeText.value = page.replace(/_/g, ' ').trim()
          } else {
            // Final fallback: intent itself
            freeText.value = intent.replace(/_/g, ' ').trim()
          }

          const nextPrompt = `Click Send to get help with ${intentLabel}. Edit the sentence if you want.`
          state.prompt = nextPrompt
          updatePromptTextOnly(nextPrompt)

          state.hasInteracted = true
          lockPromptRotation()

          try {
            freeText.focus()
            freeText.setSelectionRange(
              freeText.value.length,
              freeText.value.length
            )
          } catch (_) {}

          try {
            clearSeedGuideIfPresent()
          } catch (_) {}
        }
      } catch (_) {}
    }
    freeText.addEventListener('focus', () => {
      state.hasInteracted = true
      lockPromptRotation()
    })

    freeText.addEventListener('input', () => {
      // stop rotating placeholder once the visitor starts typing
      if (state.placeholderTimer) {
        try {
          window.clearInterval(state.placeholderTimer)
        } catch (_) {}
        state.placeholderTimer = null
      }

      state.hasInteracted = true
      lockPromptRotation()
      const first = state.messages && state.messages[0]
      const isSeed =
        first &&
        first.role === 'guide' &&
        String(first.text || '').trim() === SEED_GUIDE_TEXT
      if (isSeed) clearSeedGuideIfPresent()
    })

    freeText.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        sendBtn.click()
      }
    })

    // Example chips: tap to fill (no auto-submit)
    const exampleRow = document.querySelector('.exampleRow')
    if (exampleRow) {
      exampleRow.addEventListener('click', e => {
        const btn = e.target?.closest?.('.exampleChip')
        if (!btn) return
        const ex = btn.getAttribute('data-example') || ''
        if (!ex) return
        freeText.value = ex
        try {
          freeText.focus()
          freeText.setSelectionRange(
            freeText.value.length,
            freeText.value.length
          )
        } catch (_) {}
      })
    }

    // Rotating placeholder (stops on typing)
    if (!state.placeholderTimer) {
      state.placeholderTimer = window.setInterval(() => {
        const input = document.getElementById('freeText')
        if (!input) return
        if (String(input.value || '').trim()) {
          try {
            window.clearInterval(state.placeholderTimer)
          } catch (_) {}
          state.placeholderTimer = null
          return
        }
        state.placeholderText = nextRotatingPlaceholder(state.placeholderText)
        input.setAttribute('placeholder', state.placeholderText)
      }, 4200)
    }

    sendBtn.onclick = () => {
      const text = (freeText.value || '').trim()
      if (!text) return
      freeText.value = ''

      if (state.callOfferPending) {
        const t = text.toLowerCase()

        const isYes =
          t === 'yes' ||
          t === 'y' ||
          t === 'yep' ||
          t === 'yeah' ||
          t === 'sure' ||
          t === 'ok' ||
          t === 'okay' ||
          t === "let's do it" ||
          t === 'lets do it' ||
          t === 'call' ||
          t === 'call me'

        const isNo = t === 'no' || t === 'n' || t === 'nope' || t === 'not now'

        state.callOfferPending = false
        state.callOfferAnswer = isYes ? 'yes' : isNo ? 'no' : ''

        clearSeedGuideIfPresent()
        pushMessage('visitor', text)

        if (isYes) {
          const phoneCta = (state.cta || []).find(
            c => c && c.kind === 'phone' && c.phone
          )
          if (phoneCta) {
            pushMessage('guide', 'Cool. Calling now…')
            window.location.href = `tel:${phoneCta.phone}`
            return
          }
          pushMessage(
            'guide',
            'Cool. Tap the Call button up top and we’ll finish this together.'
          )
          try {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          } catch (_) {
            window.scrollTo(0, 0)
          }
          return
        }

        if (isNo) {
          pushMessage(
            'guide',
            'All good. Let’s keep going — what’s the main thing you want fixed?'
          )
        } else {
          pushMessage(
            'guide',
            'Got it. Give me one more detail so I can narrow this down.'
          )
        }
      } else {
        clearSeedGuideIfPresent()
        pushMessage('visitor', text)
      }

      setRevealed([])
      state.loadingLabel = 'Processing your response . . .'
      state.isCalling = true
      render()

      state.hasInteracted = true
      lockPromptRotation()
      callConcierge('reply')
    }
  }

  // Category circle buttons (choices)
  const choicesMount = document.getElementById('choices')
  if (choicesMount) {
    const btns = Array.from(
      choicesMount.querySelectorAll('button[data-choice]')
    )
    btns.forEach(btn => {
      btn.onclick = () => {
        if (state.isCalling) return

        const choiceValue = String(btn.getAttribute('data-choice') || '').trim()
        const choiceLabel = String(btn.textContent || '').trim()
        if (!choiceValue) return

        // Treat the choice like a visitor message so the backend doesn't need special cases.
        state.hasInteracted = true
        lockPromptRotation()

        clearSeedGuideIfPresent()
        pushMessage('visitor', choiceLabel || choiceValue)

        setRevealed([])
        state.loadingLabel = 'Processing your response . . .'
        state.isCalling = true
        render()

        // Optional: keep last choice for debugging
        state.lastChoice = { value: choiceValue, label: choiceLabel }

        // Same concierge path as free text
        callConcierge('reply')
      }
    })
  }

  const messagesEl = document.getElementById('messages')
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight
}
