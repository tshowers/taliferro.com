;(() => {
  // ---------- Config ----------
  const MIN_TIME_MS = 12000 // wait 12s before eligible
  const MIN_SCROLL = 0.35 // 35% scroll before eligible
  const STORAGE_KEY = 'tf_exit_intent_shown_v1'
  const SOURCE = 'exit_intent'
  const CONTACT_EMAIL = 'info@taliferro.com'
  const CONTACT_PHONE = '4016462662'
  const API_ENDPOINT =
    'https://api.taliferro.tech/api/marketing/public-contact-intake'
  const VISITOR_KEY = 'tf_contact_visitor_id'
  const SESSION_KEY = 'tf_contact_session_id'

  // Maps each modal's context key to the same interestArea labels the
  // contact form uses, so leads land in the CRM under a value a human
  // reviewing them will recognize.
  const INTEREST_AREA = {
    agile_coaching: 'Delivery and agile help',
    api_design: 'APIs and integration',
    ai_ml: 'AI and automation',
    ecommerce: 'Software development',
    website_development: 'Software development',
    cloud_architecture: 'Cloud architecture',
    todd: 'Momentum System',
    security: 'General consulting',
    bms: 'Momentum System',
    general: 'General consulting'
  }

  // Debug / test controls
  const EI_DEBUG =
    (new URLSearchParams(window.location.search).get('ei_debug') || '') === '1'
  const EI_FORCE =
    (new URLSearchParams(window.location.search).get('ei_force') || '') === '1'

  function dbg (...args) {
    if (!EI_DEBUG) return
    try {
      console.log('[exit-intent]', ...args)
    } catch {}
  }

  const COPY = {
    agile_coaching: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick agile check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe the agile issue',
      intent: 'agile_coaching'
    },

    api_design: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick API check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe the API issue',
      intent: 'api_design'
    },

    ai_ml: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick AI check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe the AI issue',
      intent: 'ai'
    },

    ecommerce: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick e-commerce check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe the store issue',
      intent: 'ecommerce'
    },

    website_development: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick website check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe the website issue',
      intent: 'website_development'
    },

    cloud_architecture: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick cloud check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe the cloud issue',
      intent: 'cloud_architecture'
    },

    todd: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick TODD check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe what you want TODD to do',
      intent: 'todd'
    },

    security: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick security check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe the security concern',
      intent: 'security'
    },

    bms: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick momentum check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe what’s stuck',
      intent: 'bms'
    },

    general: {
      kicker: 'Momentum broke somewhere',
      headline: 'Quick check?',
      body: 'Type what’s stuck. We’ll route you to the right next step.',
      cta: 'Describe what’s stuck',
      intent: 'general'
    }
  }

  // ---------- Guards ----------
  function isDesktopPointer () {
    // Exit intent is a mouse pattern; skip touch devices
    return window.matchMedia && window.matchMedia('(pointer:fine)').matches
  }

  function alreadyShown () {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  }

  function markShown () {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {}
  }

  function getMeta (name) {
    const el = document.querySelector(`meta[name="${name}"]`)
    return el ? (el.getAttribute('content') || '').trim() : ''
  }

  function getStoredId (storageKey, prefix) {
    try {
      const current = window.localStorage.getItem(storageKey)
      if (current) return current
      const next =
        prefix +
        '_' +
        Math.random().toString(16).slice(2) +
        '_' +
        Date.now().toString(16)
      window.localStorage.setItem(storageKey, next)
      return next
    } catch (_) {
      return (
        prefix +
        '_' +
        Math.random().toString(16).slice(2) +
        '_' +
        Date.now().toString(16)
      )
    }
  }

  function isValidEmail (value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  function getContextKey () {
    return getMeta('page-intent') || 'general'
  }

  function getPageParam () {
    // Prefer explicit meta title; otherwise derive from path
    const t = getMeta('page-title')
    if (t) return slugify(t)
    const p =
      (location.pathname || '/').split('/').filter(Boolean).pop() || 'home'
    return slugify(p.replace(/\.(html?)$/i, ''))
  }

  function slugify (s) {
    return String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60)
  }

  function scrollRatio () {
    const doc = document.documentElement
    const scrollTop = window.scrollY || doc.scrollTop || 0
    const scrollHeight = (doc.scrollHeight || 0) - (window.innerHeight || 1)
    if (scrollHeight <= 0) return 0
    return scrollTop / scrollHeight
  }

  // ---------- Modal ----------
  function ensureStyles () {
    if (document.getElementById('tf-exit-intent-style')) return
    const style = document.createElement('style')
    style.id = 'tf-exit-intent-style'
    style.textContent = `
      .tf-ei-backdrop{
        position:fixed; inset:0; background:rgba(0,0,0,.55);
        display:flex; align-items:center; justify-content:center;
        z-index:2147483647; padding:16px;
      }
      .tf-ei-modal{
        width:min(560px, 100%);
        background: #0b0c0f;
        color: #fff;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 18px;
        box-shadow: 0 20px 60px rgba(0,0,0,.5);
        padding: 18px 18px 14px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      .tf-ei-kicker{
        font-size: 12px;
        letter-spacing: .08em;
        text-transform: uppercase;
        opacity: .78;
        margin-bottom: 10px;
      }
      .tf-ei-h{
        font-size: 22px;
        line-height: 1.15;
        margin: 0 0 10px 0;
      }
      .tf-ei-b{
        font-size: 15px;
        line-height: 1.5;
        opacity: .92;
        margin: 0 0 14px 0;
      }
      .tf-ei-inputwrap{
        margin: 0 0 14px 0;
      }
      .tf-ei-inputwrap .tf-ei-input{
        margin-bottom: 8px;
      }
      .tf-ei-status{
        font-size: 13px;
        line-height: 1.4;
        min-height: 16px;
        margin: 0 0 10px 0;
        opacity: .92;
      }
      .tf-ei-input{
        width: 100%;
        border-radius: 12px;
        padding: 11px 12px;
        font-size: 15px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.06);
        color: #fff;
        outline: none;
      }
      .tf-ei-input:focus{
        border-color: rgba(255,255,255,.35);
      }
      .tf-ei-row{
        display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;
      }
      .tf-ei-btn{
        border-radius: 12px;
        padding: 10px 14px;
        font-weight: 650;
        border: 1px solid rgba(255,255,255,.18);
        background: transparent;
        color: #fff;
        cursor:pointer;
        text-decoration:none;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width: 120px;
      }
      .tf-ei-btn.primary{
        background: #ffffff;
        color: #0b0c0f;
        border-color: rgba(255,255,255,.2);
      }
      .tf-ei-x{
        float:right;
        border:none;
        background:transparent;
        color:#fff;
        opacity:.7;
        font-size: 18px;
        cursor:pointer;
      }
      .tf-ei-x:hover{ opacity:1; }
      @media (prefers-color-scheme: light){
        .tf-ei-modal{
          background:#fff; color:#111;
          border: 1px solid rgba(0,0,0,.12);
        }
        .tf-ei-btn{ color:#111; border-color: rgba(0,0,0,.12); }
        .tf-ei-btn.primary{ background:#111; color:#fff; }
        .tf-ei-x{ color:#111; }
        .tf-ei-input{
          border-color: rgba(0,0,0,.12);
          background: rgba(0,0,0,.04);
          color: #111;
        }
        .tf-ei-input:focus{
          border-color: rgba(0,0,0,.25);
        }
      }
    `
    document.head.appendChild(style)
  }

  function openModal (copy) {
    ensureStyles()

    const backdrop = document.createElement('div')
    backdrop.className = 'tf-ei-backdrop'
    backdrop.setAttribute('role', 'dialog')
    backdrop.setAttribute('aria-modal', 'true')
    backdrop.setAttribute('aria-label', 'Quick action')

    const modal = document.createElement('div')
    modal.className = 'tf-ei-modal'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'tf-ei-x'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.textContent = '×'

    const kicker = document.createElement('div')
    kicker.className = 'tf-ei-kicker'
    kicker.textContent = copy.kicker

    const h = document.createElement('h2')
    h.className = 'tf-ei-h'
    h.textContent = copy.headline

    const b = document.createElement('p')
    b.className = 'tf-ei-b'
    b.textContent = copy.body

    const inputWrap = document.createElement('div')
    inputWrap.className = 'tf-ei-inputwrap'

    const input = document.createElement('input')
    input.className = 'tf-ei-input'
    input.type = 'text'
    input.placeholder = 'What’s the one thing you need to fix?'
    input.autocomplete = 'off'
    input.inputMode = 'text'

    const emailInput = document.createElement('input')
    emailInput.className = 'tf-ei-input'
    emailInput.type = 'email'
    emailInput.placeholder = 'you@company.com'
    emailInput.autocomplete = 'email'
    emailInput.setAttribute('aria-label', 'Email address')

    // Honeypot: real form fields get this name; bots tend to fill it,
    // humans never see it. Kept off the visible layout, not display:none,
    // so it still registers as "filled" the same way it does on the
    // contact form.
    const honeypotWrap = document.createElement('div')
    honeypotWrap.style.cssText =
      'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;'
    const honeypot = document.createElement('input')
    honeypot.type = 'text'
    honeypot.name = 'middleName'
    honeypot.tabIndex = -1
    honeypot.autocomplete = 'off'
    honeypotWrap.appendChild(honeypot)

    const status = document.createElement('p')
    status.className = 'tf-ei-status'
    status.setAttribute('aria-live', 'polite')

    inputWrap.appendChild(input)
    inputWrap.appendChild(emailInput)
    inputWrap.appendChild(honeypotWrap)
    inputWrap.appendChild(status)

    const row = document.createElement('div')
    row.className = 'tf-ei-row'

    const btnNo = document.createElement('button')
    btnNo.className = 'tf-ei-btn'
    btnNo.type = 'button'
    btnNo.textContent = 'No thanks'

    const page = getPageParam()

    function setStatus (message, isError) {
      status.textContent = message || ''
      status.style.color = isError ? '#ff8a80' : ''
    }

    function storeCtaHandoff () {
      const raw = (input.value || '').trim()
      const clipped = raw ? raw.slice(0, 220) : ''

      const payload = {
        intent: String(copy.intent || '')
          .trim()
          .toLowerCase(),
        source: String(SOURCE || '')
          .trim()
          .toLowerCase(),
        page: String(page || '')
          .trim()
          .toLowerCase(),
        q: clipped
      }

      try {
        sessionStorage.setItem('talf_cta', JSON.stringify(payload))
      } catch (_) {}
    }

    const btnYes = document.createElement('button')
    btnYes.className = 'tf-ei-btn primary'
    btnYes.type = 'button'
    btnYes.textContent = copy.cta

    async function submitLead () {
      const emailVal = (emailInput.value || '').trim().toLowerCase()

      if (!isValidEmail(emailVal)) {
        setStatus('Enter a valid email so we can follow up.', true)
        emailInput.focus()
        return
      }

      storeCtaHandoff()

      // Bot filled the hidden field: pretend success, send nothing.
      if ((honeypot.value || '').trim()) {
        setStatus('Thanks — we’ll follow up.')
        return
      }

      const payload = {
        email: emailVal,
        interestArea: INTEREST_AREA[copy.intent] || 'General consulting',
        helpNeeded: (input.value || '').trim() || copy.headline,
        middleName: honeypot.value || '',
        source: 'exit_intent:' + copy.intent,
        pageTitle: page,
        pageUrl: window.location.href,
        referrer: document.referrer || '',
        anonymousVisitorId: getStoredId(VISITOR_KEY, 'visitor'),
        anonymousSessionId: getStoredId(SESSION_KEY, 'session')
      }

      btnYes.disabled = true
      btnYes.textContent = 'Sending…'
      setStatus('Sending…')

      try {
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result.success === false) {
          throw new Error(result.message || 'Unable to send right now.')
        }
        setStatus('Thanks — we’ll follow up at ' + emailVal + '.')
        btnYes.textContent = 'Sent'
        input.disabled = true
        emailInput.disabled = true
      } catch (err) {
        setStatus(
          (err && err.message) ||
            'Unable to send right now. Try email or phone below.',
          true
        )
        btnYes.disabled = false
        btnYes.textContent = copy.cta
      }
    }

    btnYes.addEventListener('click', submitLead)

    function updateEmailHref () {
      const subject = `Help request: ${copy.intent}`
      const bodyParts = []

      if (input.value.trim()) {
        bodyParts.push('Problem: ' + input.value.trim())
      }

      bodyParts.push('Intent: ' + copy.intent)
      bodyParts.push('Page: ' + page)
      bodyParts.push('Source: exit_intent')

      emailLink.href =
        'mailto:' +
        CONTACT_EMAIL +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(bodyParts.join('\n\n'))
    }

    input.addEventListener('input', () => {
      // Keep the handoff payload fresh as the user types
      storeCtaHandoff()
    })

    input.addEventListener('input', updateEmailHref)

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submitLead()
      }
    })

    emailInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submitLead()
      }
    })

    const secondaryWrap = document.createElement('div')
    secondaryWrap.style.width = '100%'
    secondaryWrap.style.display = 'flex'
    secondaryWrap.style.justifyContent = 'space-between'
    secondaryWrap.style.alignItems = 'center'
    secondaryWrap.style.marginTop = '10px'

    const emailLink = document.createElement('a')
    emailLink.href = 'mailto:' + CONTACT_EMAIL
    emailLink.textContent = 'Email us'
    emailLink.style.fontSize = '14px'
    emailLink.style.opacity = '.85'
    emailLink.style.textDecoration = 'underline'

    const callLink = document.createElement('a')
    callLink.href = 'tel:' + CONTACT_PHONE
    callLink.textContent = 'Call us'
    callLink.style.fontSize = '14px'
    callLink.style.opacity = '.85'
    callLink.style.textDecoration = 'underline'

    row.appendChild(btnNo)
    row.appendChild(btnYes)
    row.appendChild(secondaryWrap)

    secondaryWrap.appendChild(emailLink)
    secondaryWrap.appendChild(callLink)

    modal.appendChild(closeBtn)
    modal.appendChild(kicker)
    modal.appendChild(h)
    modal.appendChild(b)
    modal.appendChild(inputWrap)
    modal.appendChild(row)

    backdrop.appendChild(modal)
    document.body.appendChild(backdrop)

    setTimeout(() => input.focus(), 0)

    // Initialize handoff in case the user clicks immediately
    storeCtaHandoff()

    function close () {
      backdrop.remove()
      document.removeEventListener('keydown', onKey)
    }

    function onKey (e) {
      if (e.key === 'Escape') close()
    }

    closeBtn.addEventListener('click', close)
    btnNo.addEventListener('click', close)
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) close()
    })
    document.addEventListener('keydown', onKey)
  }

  // ---------- Exit intent trigger ----------
  const startedAt = Date.now()
  let fired = false

  function eligible () {
    if (EI_FORCE) {
      dbg('eligible: forced via ?ei_force=1')
      return true
    }

    const desktop = isDesktopPointer()
    const shown = alreadyShown()
    const ageOk = Date.now() - startedAt >= MIN_TIME_MS
    const scrollOk = scrollRatio() >= MIN_SCROLL

    dbg('eligible check', {
      desktop,
      shown,
      ageMs: Date.now() - startedAt,
      minTimeMs: MIN_TIME_MS,
      ageOk,
      scroll: Number(scrollRatio().toFixed(3)),
      minScroll: MIN_SCROLL,
      scrollOk
    })

    if (!desktop) return false
    if (shown) return false
    if (!ageOk) return false
    if (!scrollOk) return false
    return true
  }

  function onMouseOut (e) {
    // Only fire when leaving the top of viewport
    if (fired) return
    if (!eligible()) return

    // relatedTarget null often means leaving window
    const to = e.relatedTarget || e.toElement
    if (to) return

    // Cursor near top edge
    if (e.clientY > 0) return

    fired = true
    markShown()

    const key = getContextKey()
    const copy = COPY[key] || COPY.general
    openModal(copy)
  }

  dbg('booted', { url: location.href, pointerFine: isDesktopPointer() })
  document.addEventListener('mouseout', onMouseOut, { passive: true })
})()
