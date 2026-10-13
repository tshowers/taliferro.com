;(function () {
  const serviceButtons = () =>
    Array.from(document.querySelectorAll('.home-service-btn'))

  const clickMatchingRecommendation = query => {
    const normalized = String(query || '')
      .trim()
      .toLowerCase()
    if (!normalized) return false

    const clickable = Array.from(
      document.querySelectorAll(
        '#appRight button, #appRight [role="button"], #appBelow button, #appBelow [role="button"], #appRight .pill, #appBelow .pill, #appRight .pillStatic, #appBelow .pillStatic, #appRight a, #appBelow a'
      )
    )
    const exact = clickable.find(
      node => (node.textContent || '').trim().toLowerCase() === normalized
    )
    if (exact) {
      exact.click()
      return true
    }

    const partial = clickable.find(node =>
      (node.textContent || '').trim().toLowerCase().includes(normalized)
    )
    if (partial) {
      partial.click()
      return true
    }

    return false
  }

  const fillInteractiveInput = query => {
    const input = document.querySelector(
      '#appRight input, #appRight textarea, #appRight [contenteditable="true"]'
    )
    if (!input) return false

    const value = String(query || '').trim()
    if (!value) return false

    if (input.matches('[contenteditable="true"]')) {
      input.textContent = value
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value,
          inputType: 'insertText'
        })
      )
    } else {
      input.focus()
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          which: 13,
          keyCode: 13,
          bubbles: true
        })
      )
      input.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          which: 13,
          keyCode: 13,
          bubbles: true
        })
      )
    }

    return true
  }

  const runServiceQuery = query => {
    const guidancePanel = document.querySelector('.home-right-guidance-panel')
    if (guidancePanel && typeof guidancePanel.scrollIntoView === 'function') {
      guidancePanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    if (clickMatchingRecommendation(query)) return

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (clickMatchingRecommendation(query)) {
        window.clearInterval(timer)
        return
      }
      if (attempts >= 8) {
        window.clearInterval(timer)
        fillInteractiveInput(query)
      }
    }, 250)
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest('.home-service-btn')
    if (!btn) return
    const query = btn.getAttribute('data-service-query')
    if (!query) return
    event.preventDefault()
    runServiceQuery(query)
  })

  serviceButtons().forEach(btn => {
    btn.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        const query = btn.getAttribute('data-service-query')
        if (!query) return
        event.preventDefault()
        runServiceQuery(query)
      }
    })
  })
})()
;(function () {
  const toggle = document.getElementById('homeExploreToggle')
  const panel = document.getElementById('homeExplorePanel')
  if (!toggle || !panel) return

  toggle.addEventListener('click', () => {
    const willOpen = toggle.getAttribute('aria-expanded') !== 'true'
    toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false')
    panel.hidden = !willOpen
  })
})()

// Route attention to the interactive input if it exists
;(function () {
  const btn = document.getElementById('ctaStartInteractive')
  if (!btn) return

  btn.addEventListener('click', () => {
    const panel = document.querySelector('.home-right')
    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setTimeout(() => {
      const input = document.querySelector(
        '#appRight input, #appRight textarea, #appRight [contenteditable="true"]'
      )
      if (input && typeof input.focus === 'function') input.focus()
    }, 250)
  })
})()
;(function () {
  const promos = [
    document.getElementById('promoLeadVault'),
    document.getElementById('promoPulse')
  ].filter(Boolean)

  if (promos.length < 2) return

  let currentIndex = 0

  const showPromo = index => {
    promos.forEach((promo, promoIndex) => {
      promo.hidden = promoIndex !== index
    })
  }

  showPromo(currentIndex)

  window.setInterval(() => {
    currentIndex = (currentIndex + 1) % promos.length
    showPromo(currentIndex)
  }, 30000)
})()
;(function () {
  window.__bootErrors = []
  // Prove this trap script ran (even if there are no console errors)
  window.__bootTrapInstalledAt = Date.now()
  function push (kind, payload) {
    window.__bootErrors.push({ kind, payload, ts: Date.now() })
    try {
      console.error('[boot]', kind, payload)
    } catch (_) {}
    // Also show something on-screen so you don't need the console
    var el = document.getElementById('appRight')
    if (el && window.__bootErrors.length === 1) {
      el.innerHTML =
        '<div style="padding:12px;border:1px solid rgba(0,0,0,.15);border-radius:12px">' +
        '<strong>Quick guidance failed to load in this browser.</strong><br>' +
        '<span style="font-size:12px;opacity:.8">Open Safari console for details.</span><br>' +
        '<span style="font-size:12px;opacity:.8">' +
        'First error: ' +
        kind +
        '</span>' +
        '</div>'
    }
  }

  window.addEventListener('error', function (e) {
    push('error', {
      message: e.message,
      file: e.filename,
      line: e.lineno,
      col: e.colno
    })
  })

  window.addEventListener('unhandledrejection', function (e) {
    push('unhandledrejection', { reason: String(e.reason) })
  })
})()

window.__classicScriptRan = true
try {
  var el = document.getElementById('appRight')
  if (el) {
    el.setAttribute('data-classic-script', 'ran')
  }
} catch (_) {}
