import { state } from 'https://taliferro.com/js/taliferro.shared.js'
import { getAllModules } from 'https://taliferro.com/js/taliferro.modules.js'

const BEST_FOR_KEYWORDS = [
  { key: 'ai', words: ['ai', 'ml', 'machine learning', 'genai', 'prompt', 'llm'] },
  { key: 'security', words: ['security', 'secure', 'vulnerability', 'owasp', 'zero trust', 'compliance'] },
  { key: 'web_dev', words: ['web', 'website', 'frontend', 'front end', 'backend', 'api', 'javascript', 'angular', 'react', 'css', 'html'] },
  { key: 'cloud', words: ['cloud', 'azure', 'aws', 'gcp', 'google cloud', 'firebase', 'kubernetes'] },
  { key: 'apis', words: ['api', 'integration', 'gateway', 'oauth', 'sso', 'rest', 'graphql'] },
  { key: 'ecommerce', words: ['ecommerce', 'e-commerce', 'shopify', 'checkout', 'cart', 'payments'] },
  { key: 'agile', words: ['agile', 'scrum', 'kanban', 'sprint', 'backlog'] },
  { key: 'outreach', words: ['outreach', 'follow up', 'follow-up', 'pipeline', 'leads', 'prospects', 'customers', 'sales', 'conversion', 'todd'] }
]

const STOPWORDS = new Set([
  'a','an','the','and','or','but','so','to','of','in','on','for','with','by','at','from','into','is','are','was','were','be','been','being',
  'i','we','you','they','it','this','that','these','those','my','our','your','their','me','us',
  'help','need','want','looking','like','really','just','some','any','about','please','amp'
])

function norm (s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normTag (s) {
  // Defensive: strip any accidental markup and normalize.
  return norm(String(s || '').replace(/<[^>]+>/g, ' '))
}

function tokenize (s) {
  const t = norm(s)
  if (!t) return []
  return t
    .split(' ')
    .map(x => x.trim())
    .filter(x => x && x.length >= 3 && !STOPWORDS.has(x))
}

function inferBestForKeys (recentText) {
  const picks = new Set()

  const choice = norm(state.lastSelectedChoiceValue || '')
  if (choice) picks.add(choice)

  for (const rule of BEST_FOR_KEYWORDS) {
    if (rule.words.some(w => recentText.includes(norm(w)))) picks.add(rule.key)
  }

  if (picks.size === 0) picks.add('all')
  return Array.from(picks)
}

function buildQueryContext () {
  // Favor the most recent visitor message; fall back to the last few messages.
  const lastVisitor = (state.messages || []).slice().reverse().find(m => m && m.role === 'visitor' && String(m.text || '').trim())
  const primary = lastVisitor ? String(lastVisitor.text || '') : ''

  const recent = (state.messages || [])
    .slice(-6)
    .map(m => String(m.text || ''))
    .join(' ')

  const combined = norm(`${primary} ${recent} ${state.lastSelectedChoice || ''} ${state.lastSelectedChoiceValue || ''}`)

  const keys = inferBestForKeys(combined)
  const terms = tokenize(combined)

  // Also include multi-word domain phrases as “terms” when present.
  const phraseTerms = []
  for (const rule of BEST_FOR_KEYWORDS) {
    for (const w of rule.words) {
      const nw = norm(w)
      if (nw.includes(' ') && combined.includes(nw)) phraseTerms.push(nw)
    }
  }

  const selectionKey = norm(state.lastSelectedChoiceValue || '')
  const hasVisitorSignal = !!primary.trim()
  const mentionsTodd = combined.includes('todd') || combined.includes('outreach') || combined.includes('pipeline') || combined.includes('follow up') || combined.includes('follow-up')

  return { combined, keys, terms, phraseTerms, selectionKey, hasVisitorSignal, mentionsTodd }
}

function scoreModule (m, ctx) {
  const bfRaw = Array.isArray(m.best_for) ? m.best_for : []
  const bf = bfRaw.map(normTag)
  const type = String(m.type || '').trim()

  const keys = ctx.keys || []
  const terms = ctx.terms || []
  const phraseTerms = ctx.phraseTerms || []
  const selectionKey = ctx.selectionKey || ''
  const hasVisitorSignal = !!ctx.hasVisitorSignal
  const mentionsTodd = !!ctx.mentionsTodd

  const kw = Array.isArray(m.keywords) ? m.keywords.join(' ') : ''
  const hay = norm(`${m.title || ''} ${m.description || ''} ${kw} ${m.asset?.url || ''}`)

  let score = 0

  // Best_for overlap
  for (const k of keys) {
    if (k === 'all') continue
    if (bf.includes(normTag(k))) score += 6
  }

  // Guardrail 1: If the visitor only clicked a circle (no typed detail yet),
  // prefer modules that explicitly match the selected best_for.
  if (selectionKey && !hasVisitorSignal) {
    if (bf.includes(selectionKey)) {
      score += 8
    } else if (bf.includes('all')) {
      // Allow case studies to still appear as proof even when best_for is 'all'.
      score += type === 'case-study' ? 0 : -6
    } else {
      score -= 10
    }
  }

  // Type bias (keep subtle)
  if (type === 'explainer') score += 3
  if (type === 'video') score += 2
  if (type === 'page-preview') score += 2
  if (type === 'blog') score += 1
  if (type === 'image') score += 1
  if (type === 'case-study') score += 3

  // Phrase match (stronger than single token)
  for (const p of phraseTerms) {
    if (p && hay.includes(p)) score += 8
  }

  // Keyword overlap (strong signal)
  const kwTokens = Array.isArray(m.keywords) ? m.keywords.map(normTag) : []
  for (const t of terms) {
    if (!t) continue
    if (kwTokens.includes(t)) score += 4
  }

  // Guardrail 2: For web_dev, avoid TODD/outreach content unless the visitor mentions it.
  if (selectionKey === 'web_dev' && !mentionsTodd) {
    const kwTokens = Array.isArray(m.keywords) ? m.keywords.map(normTag) : []
    const isToddish =
      kwTokens.includes('todd') ||
      kwTokens.includes('outreach') ||
      kwTokens.includes('pipeline') ||
      kwTokens.includes('follow') ||
      kwTokens.includes('followup') ||
      hay.includes('todd') ||
      hay.includes('outreach') ||
      hay.includes('pipeline')

    // Also consider explicit best_for outreach as a TODD/outreach indicator.
    const isOutreachTagged = bf.includes('outreach')

    if (isToddish || isOutreachTagged) {
      score -= 12
    }
  }

  // Token overlap
  for (const t of terms) {
    if (!t) continue
    if (hay.includes(t)) score += 0.5
  }

  // Encourage fresh movement between turns: lightly penalize what’s already showing.
  if (Array.isArray(state.revealed) && state.revealed.includes(m.module_id)) {
    score -= 2
  }

  return score
}

function diversify (items, limit) {
  // Keep results varied by type; don’t let one type dominate.
  const caps = {
    explainer: 2,
    video: 4,
    'page-preview': 4,
    blog: 5,
    image: 4,
    testimonial: 2,
    product: 3,
    service: 3,
    feature: 3,
    brochure: 2,
    'case-study': 3,
    pricing: 2,
    cta: 1
  }

  const out = []
  const perType = {}

  for (const it of items) {
    if (out.length >= limit) break
    const t = it.type || 'other'
    perType[t] = perType[t] || 0
    const cap = caps[t] ?? 4
    if (perType[t] >= cap) continue
    perType[t] += 1
    out.push(it)
  }

  // If we still don't have enough, fill without caps.
  if (out.length < limit) {
    for (const it of items) {
      if (out.length >= limit) break
      if (out.some(x => x.id === it.id)) continue
      out.push(it)
    }
  }

  return out
}

export function localRelevantModuleIds (limit = 18) {
  const modules = getAllModules() || []
  const ctx = buildQueryContext()

  const scored = modules.map(m => ({
    id: m.module_id,
    type: m.type,
    score: scoreModule(m, ctx)
  }))

  const hasSignal = scored.some(s => s.score > 0)
  const ordered = hasSignal
    ? scored.sort((a, b) => (b.score - a.score) || String(a.id).localeCompare(String(b.id)))
    : scored.sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const diversified = diversify(ordered, limit)

  return diversified.map(s => s.id)
}