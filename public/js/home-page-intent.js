;(function () {
  function normalize (v) {
    return String(v || '')
      .trim()
      .toLowerCase()
  }

  function writeHandoff (a) {
    const payload = {
      intent: normalize(a.getAttribute('data-intent')),
      source: normalize(a.getAttribute('data-source')),
      page: normalize(a.getAttribute('data-page')),
      q: String(a.getAttribute('data-q') || '')
        .trim()
        .slice(0, 220)
    }

    try {
      sessionStorage.setItem('talf_cta', JSON.stringify(payload))
    } catch (e) {
      // never break navigation if storage fails
      try {
        console.warn('CTA tracking storage failed', e)
      } catch (_) {}
    }

    return payload
  }

  function goHome () {
    try {
      window.location.href = 'https://taliferro.com/'
    } catch (_) {
      try {
        window.location = 'https://taliferro.com/'
      } catch (_) {}
    }
  }

  // Delegated capture so it works even if CTAs are injected later
  document.addEventListener(
    'click',
    function (e) {
      const a =
        e && e.target && e.target.closest
          ? e.target.closest('a[data-intent]')
          : null
      if (!a) return

      // Only intercept if it's intended to go to the homepage
      const href = String(a.getAttribute('href') || '').trim()
      const isHomeLink =
        !href ||
        href === '/' ||
        href === 'https://taliferro.com' ||
        href === 'https://taliferro.com/'

      if (!isHomeLink) return

      // Store handoff BEFORE navigating
      try {
        e.preventDefault()
      } catch (_) {}
      writeHandoff(a)
      goHome()
    },
    true
  )
})()
