#!/usr/bin/env node
// Rebuild ItemList JSON-LD inside blog/toc.html, based on blog posts.
// Usage:
// node scripts/rebuild-toc.mjs \
//   --root ./root/public \
//   --site https://taliferro.com \
//   --toc blog/toc.html \
//   --limit-days 365 \
//   --exclude "drafts/**,**/thank-you.html"
// Notes:
// - By default, this script rebuilds the ItemList JSON-LD in blog/toc.html.
// - If blog/toc.html contains HTML markers <!-- TOC:BEGIN --> ... <!-- TOC:END -->,
//   the script will also regenerate the visible HTML list between those markers.

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const DAY_MS = 24 * 60 * 60 * 1000

// --- arg parse (tiny)
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => {
      if (!a.startsWith('--')) return []
      const k = a.slice(2)
      const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true
      return [k, v]
    })
    .filter(Boolean)
)

const ROOT = path.resolve(args.root ?? './root/public')
const SITE = String(args.site ?? 'https://taliferro.com').replace(/\/+$/, '')
let TOC_PATH = args.toc
  ? path.isAbsolute(args.toc)
    ? args.toc
    : path.join(ROOT, args.toc)
  : path.join(ROOT, 'blog/toc.html')

const LIMIT_DAYS =
  args['limit-days'] !== undefined ? Number(args['limit-days']) : 365
const LIMIT_MS =
  Number.isFinite(LIMIT_DAYS) && LIMIT_DAYS > 0 ? LIMIT_DAYS * DAY_MS : null

const EXCLUDE_RAW = String(args.exclude ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const DEFAULT_EXCLUDES = [
  'blog/toc.html',
  'blog/index.html',
  '**/toc.html',
  'index.html',
  '404.html',
  '410.html',
  '**/thank-you.html',
  '**/thanks.html',
  '**/submitted.html',
  '**/success.html',
  '**/confirm*.html',
  'robots.txt',
  'rss.xml',
  'sitemap.xml'
]
const EXCLUDES = Array.from(new Set([...DEFAULT_EXCLUDES, ...EXCLUDE_RAW]))

function globToRegex (glob) {
  let s = String(glob).replace(/^\/+/, '')
  s = s.replace(/\*\*/g, '__DS__') // mark **
  s = s.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&') // escape regex specials
  s = s.replace(/\*/g, '[^/]*') // * within segment
  s = s.replace(/\?/g, '.') // ?
  s = s.replace(/__DS__/g, '.*') // ** across segments
  return new RegExp('^' + s + '$', 'i')
}
const EXCLUDE_RX = EXCLUDES.map(globToRegex)

function relFromRoot (p) {
  return path.relative(ROOT, p).replace(/\\/g, '/')
}
function isHtml (p) {
  return /\.html?$/i.test(p)
}
function isExcluded (rel) {
  const r = rel.replace(/^\/+/, '')
  return EXCLUDE_RX.some(rx => rx.test(r))
}

// Only treat files in the dated post folder structure as “blog posts”.
// Example: blog/nov2025/nov012025/my-post.html
function isDatedBlogPost (rel) {
  return /^blog\/[a-z]{3}\d{4}\/[a-z]{3}\d{2}\d{4}\/.+\.html?$/i.test(
    String(rel)
  )
}

async function* walk (dir) {
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.join(dir, d.name)
    if (d.isDirectory()) yield* walk(res)
    else yield res
  }
}

// crude extractors
function takeTitle (html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].trim().replace(/\s+/g, ' ') : null
}
function takeH1 (html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : null
}
function takeJsonLdBlocks (html) {
  const out = []
  const rx =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = rx.exec(html))) {
    const txt = m[1].trim()
    out.push(txt)
  }
  return out
}
function parseFirstJson (jsonText) {
  if (!jsonText) return null
  let txt = String(jsonText).trim()
  // Remove BOM if present
  txt = txt.replace(/^\uFEFF/, '')
  // Strip trailing commas before } or ]
  txt = txt.replace(/,\s*(?=[}\]])/g, '')
  try {
    return JSON.parse(txt)
  } catch {
    return null
  }
}
function findArticleNode (obj) {
  if (!obj) return null
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const f = findArticleNode(it)
      if (f) return f
    }
    return null
  }
  if (obj['@type'] === 'Article' || obj['@type'] === 'BlogPosting') return obj
  if (obj['@graph'] && Array.isArray(obj['@graph'])) {
    for (const it of obj['@graph']) {
      const f = findArticleNode(it)
      if (f) return f
    }
  }
  return null
}

function isoDateOnly (d) {
  return d instanceof Date && !isNaN(d)
    ? d.toISOString().slice(0, 10)
    : undefined
}

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
}
function toIsoFromDMonY (d, mon, y) {
  const m = MONTHS[String(mon).slice(0, 3).toLowerCase()]
  if (m == null) return undefined
  const day = Number(String(d).padStart(2, '0'))
  const yr = Number(y)
  const dt = new Date(Date.UTC(yr, m, day))
  return isNaN(dt) ? undefined : dt.toISOString()
}
function inferDateFromHtml (html) {
  // try OpenGraph / article meta
  const m1 = html.match(
    /<meta\s+property=(["'])article:published_time\1\s+content=(["'])([\s\S]*?)\2[^>]*>/i
  )
  if (m1) return m1[3].trim()
  const m2 = html.match(
    /<meta\s+name=(["'])datePublished\1\s+content=(["'])([\s\S]*?)\2[^>]*>/i
  )
  if (m2) return m2[3].trim()
  // try masthead span like "1 Nov 2025"
  const m3 = html.match(
    />\s*([0-9]{1,2})\s+([A-Za-z]{3,9})\s+([0-9]{4})\s*<\s*\/span>/i
  )
  if (m3) return toIsoFromDMonY(m3[1], m3[2], m3[3])
  return undefined
}
function inferDateFromPath (rel) {
  // e.g., blog/nov2025/nov012025/slug.html
  const m = String(rel).match(/\/([a-z]{3})(\d{4})\/[a-z]{3}(\d{2})(\d{4})\//i)
  if (!m) return undefined
  const mon = m[1]
  const yr = m[2]
  const dd = m[3]
  const dt = new Date(
    Date.UTC(Number(yr), MONTHS[mon.toLowerCase()] ?? 0, Number(dd))
  )
  return isNaN(dt) ? undefined : dt.toISOString()
}

async function collectPosts () {
  const rows = []
  const now = Date.now()
  for await (const abs of walk(path.join(ROOT, 'blog'))) {
    if (!isHtml(abs)) continue
    const rel = relFromRoot(abs)
    // Always skip the blog home page
    if (rel === 'blog/index.html') continue
    if (isExcluded(rel)) continue

    // Skip topic hubs / landing pages like blog/bms/, blog/ai-adoption/, etc.
    // Only include files in the dated post structure.
    if (!isDatedBlogPost(rel)) continue

    let html
    try {
      html = await fs.readFile(abs, 'utf8')
    } catch {
      continue
    }

    const stats = await fs.stat(abs).catch(() => null)
    const mtime = stats ? stats.mtime : null

    // extract JSON-LD article
    const blocks = takeJsonLdBlocks(html)
    let jd = null
    for (const b of blocks) {
      const parsed = parseFirstJson(b)
      const art = findArticleNode(parsed)
      if (art) {
        jd = art
        break
      }
    }

    // meta extractors (per file)
    const metaDescMatch = html.match(
      /<meta\s+name=(["'])description\1\s+content=(["'])([\s\S]*?)\2[^>]*>/i
    )
    const ogImageMatch = html.match(
      /<meta\s+property=(["'])og:image\1\s+content=(["'])([\s\S]*?)\2[^>]*>/i
    )
    const twImageMatch = html.match(
      /<meta\s+name=(["'])twitter:image\1\s+content=(["'])([\s\S]*?)\2[^>]*>/i
    )

    const metaDescription = metaDescMatch ? metaDescMatch[3].trim() : ''
    const ogImage = ogImageMatch ? ogImageMatch[3].trim() : ''
    const twitterImage = twImageMatch ? twImageMatch[3].trim() : ''

    const title =
      (jd && (jd.headline || jd.name)) ||
      takeH1(html) ||
      takeTitle(html) ||
      path.basename(abs)
    const author = jd?.author?.name || jd?.author || 'Tyrone Showers'
    let url = jd?.url || '/' + rel

    // Normalize internal blog URLs that end with /index.html to folder URLs.
    // e.g., "/blog/sep2023/index.html" -> "/blog/sep2023/"
    if (!/^https?:/i.test(url)) {
      const lower = url.toLowerCase()
      if (lower.endsWith('/index.html')) {
        url = url.slice(0, -'/index.html'.length) || '/'
        if (url !== '/' && !url.endsWith('/')) {
          url = url + '/'
        }
      }
    }
    let datePubISO = jd?.datePublished || undefined
    let dateModISO = jd?.dateModified || undefined
    if (!datePubISO) {
      datePubISO = inferDateFromHtml(html) || inferDateFromPath(rel)
    }

    // pick a sort date: prefer datePublished, then dateModified, then file mtime
    let sortMs = null
    const pubMs = datePubISO ? Date.parse(datePubISO) : NaN
    const modMs = dateModISO ? Date.parse(dateModISO) : NaN
    if (Number.isFinite(pubMs)) {
      sortMs = pubMs
    } else if (Number.isFinite(modMs)) {
      sortMs = modMs
    } else if (mtime) {
      sortMs = mtime.getTime()
    }

    // optional limit by days
    if (LIMIT_MS) {
      const cutoff = now - LIMIT_MS
      if (!Number.isFinite(sortMs) || sortMs < cutoff) continue
    }

    rows.push({
      rel,
      abs,
      url,
      title,
      author,
      datePublishedISO: datePubISO,
      dateModifiedISO: dateModISO,
      dateSortMs: sortMs ?? 0,
      metaDescription,
      meta: { ogImage, twitterImage }
    })
  }

  rows.sort((a, b) => b.dateSortMs - a.dateSortMs)
  return rows
}

function buildItemListJsonLd (siteBase, items) {
  const list = items.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Article',
      headline: p.title,
      url: /^https?:/i.test(p.url)
        ? p.url
        : `${siteBase}${p.url.startsWith('/') ? '' : '/'}${p.url}`,
      author: { '@type': 'Person', name: p.author || 'Tyrone Showers' },
      datePublished: p.datePublishedISO || undefined,
      dateModified: p.dateModifiedISO || undefined,
      inLanguage: 'en-US'
    }
  }))
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${siteBase}/blog/toc.html`,
      name: 'Taliferro Blog Table of Contents',
      url: `${siteBase}/blog/toc.html`,
      isPartOf: { '@id': `${siteBase}/blog#website` },
      mainEntity: { '@id': `${siteBase}/blog#all-articles` }
    },
    {
      '@type': 'ItemList',
      '@id': `${siteBase}/blog#all-articles`,
      name: 'All Articles',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: list.length,
      itemListElement: list
    }
  ]
  return JSON.stringify(
    { '@context': 'https://schema.org', '@graph': graph },
    null,
    2
  )
}

function replaceFirstItemListJsonLd (html, newJson) {
  const rx =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m,
    lastIndex = 0,
    replaced = false
  const parts = []
  while ((m = rx.exec(html))) {
    const block = m[0]
    const jsonText = m[1] ?? ''
    if (/\"ItemList\"/i.test(jsonText)) {
      parts.push(html.slice(lastIndex, m.index))
      parts.push(`<script type="application/ld+json">\n${newJson}\n</script>`)
      lastIndex = rx.lastIndex
      replaced = true
      break
    }
  }
  if (!replaced) return null // caller decides what to do
  parts.push(html.slice(lastIndex))
  return parts.join('')
}

function escapeHtml (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toMonthAbbr (n) {
  return (
    [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ][n] || ''
  )
}
function formatDateMMMDDYYYY (iso) {
  try {
    const d = new Date(iso)
    if (isNaN(d)) return ''
    return `${toMonthAbbr(
      d.getUTCMonth()
    )} ${d.getUTCDate()} ${d.getUTCFullYear()}`
  } catch {
    return ''
  }
}
function stripSiteAndBlogPrefix (siteBase, url) {
  if (!url) return ''
  let u = String(url)
  u = u.replace(
    new RegExp(
      '^' + siteBase.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&') + '/?',
      'i'
    ),
    ''
  )
  u = u.replace(/^blog\//i, '')
  u = u.replace(/^\/blog\//i, '')
  u = u.replace(/^\//, '')
  return u
}
function pickHeroImage (meta, siteBase) {
  const cand = meta?.ogImage || meta?.twitterImage || meta?.image || ''
  if (!cand) return ''
  const stripped = stripSiteAndBlogPrefix(siteBase, cand)
  return stripped || 'img/blog/placeholder.webp'
}
function summarize (text, max = 160) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return ''
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}
async function replaceBetweenMarkersInFile (
  filePath,
  beginMarker,
  endMarker,
  replacementHtml
) {
  const html = await fs.readFile(filePath, 'utf8')
  const i = html.indexOf(beginMarker)
  const j = html.indexOf(endMarker)
  if (i === -1 || j === -1 || j <= i) {
    console.log(
      `Markers not found in ${filePath}; skipped featured slider rewrite.`
    )
    return false
  }
  const head = html.slice(0, i + beginMarker.length)
  const tail = html.slice(j)
  const newHtml = head + '\n' + replacementHtml + '\n' + tail
  await fs.writeFile(filePath, newHtml, 'utf8')
  return true
}

function buildHtmlList (siteBase, items, limit = 200) {
  const take = Array.isArray(items) ? items.slice(0, limit) : []
  const lines = take.map(p => {
    const href = /^https?:/i.test(p.url)
      ? p.url
      : `${siteBase}${p.url.startsWith('/') ? '' : '/'}${p.url}`
    const rawDate = p.datePublishedISO || p.dateModifiedISO || ''
    const dateOnly = rawDate ? String(rawDate).slice(0, 10) : ''
    const dateStr = dateOnly
      ? ` <span class="date">${escapeHtml(dateOnly)}</span>`
      : ''
    return `  <li><a href="${escapeHtml(href)}">${escapeHtml(
      p.title
    )}</a>${dateStr}</li>`
  })
  return ['<ul class="toc-list">', ...lines, '</ul>'].join('\n')
}

function replaceHtmlBetweenMarkers (html, newListHtml) {
  const begin = '<!-- TOC:BEGIN -->'
  const end = '<!-- TOC:END -->'
  const i = html.indexOf(begin)
  const j = html.indexOf(end)
  if (i === -1 || j === -1 || j <= i) return null
  const head = html.slice(0, i + begin.length)
  const tail = html.slice(j)
  const body = '\n' + newListHtml + '\n'
  return head + body + tail
}

function buildFeaturedGridHtml (siteBase, posts, limit = 6) {
  const items = posts.slice(0, limit)

  const cards = items
    .map(p => {
      const hrefRel = stripSiteAndBlogPrefix(siteBase, p.url)
      const href = hrefRel || (p.url.startsWith('/') ? p.url : '/' + p.url)
      const img = pickHeroImage(p.meta || {}, siteBase)
      const title = escapeHtml(p.title || '')
      const dateIso = p.datePublishedISO || p.dateModifiedISO || ''
      const date = escapeHtml(
        formatDateMMMDDYYYY(dateIso) || String(dateIso).slice(0, 10)
      )
      const excerpt = escapeHtml(summarize(p.metaDescription || '', 160))

      return `      <div class="card">
        <img src="${img}" alt="${title}" loading="lazy" />
        <div class="divider"></div>
        <p class="fine">${date}</p>
        <h3>${title}</h3>
        ${excerpt ? `<p class="fine">${excerpt}</p>` : ''}
        <div class="btnrow" style="margin-top:10px;">
          <a class="btn primary" href="${href}">Read</a>
          <a class="btn ghost" href="toc.html">Browse topics</a>
        </div>
      </div>`
    })
    .join('\n\n')

  return `
  <section class="section" aria-label="Featured posts">
    <div class="wrap">
      <div class="kicker">Featured</div>
      <h2>Featured posts</h2>

      <div class="grid grid-2">
${cards}
      </div>

      <div class="divider"></div>

      <div class="btnrow">
        <a class="btn primary" href="toc.html">Browse all topics</a>
        <a class="btn ghost" href="/blog/bms/">Start with BMS</a>
      </div>

    </div>
  </section>
  `.trim()
}

;(async function main () {
  console.log(`Scanning posts from: ${path.join(ROOT, 'blog')} ...`)
  const posts = await collectPosts()
  console.log(`Posts selected: ${posts.length} (limit-days=${LIMIT_DAYS ?? 0})`)

  let tocHtml = await fs.readFile(TOC_PATH, 'utf8').catch(() => null)
  if (!tocHtml) {
    console.error(`ERROR: Cannot read toc file: ${TOC_PATH}`)
    process.exit(1)
  }

  const itemListJson = buildItemListJsonLd(SITE, posts)
  const replaced = replaceFirstItemListJsonLd(tocHtml, itemListJson)

  if (!replaced) {
    console.warn(
      'WARN: No ItemList JSON-LD block found in toc.html; nothing changed.'
    )
    process.exit(0)
  }

  await fs.writeFile(TOC_PATH, replaced, 'utf8')
  console.log(`Updated ItemList JSON-LD in: ${TOC_PATH}`)

  // Try to also update the visible list between markers, if present
  const htmlList = buildHtmlList(SITE, posts, 200)
  const replacedHtml = replaceHtmlBetweenMarkers(replaced, htmlList)
  if (replacedHtml) {
    await fs.writeFile(TOC_PATH, replacedHtml, 'utf8')
    console.log('Updated visible HTML TOC between markers.')
  } else {
    console.log('No TOC markers found; JSON-LD updated only.')
  }

  // --- Update blog home featured slider (if markers exist) ---
  try {
    const BLOG_INDEX = path.join(ROOT, 'blog', 'index.html')
    const featuredHtml = buildFeaturedGridHtml(SITE, posts, 6)
    const ok = await replaceBetweenMarkersInFile(
      BLOG_INDEX,
      '<!-- FEATURED:BEGIN -->',
      '<!-- FEATURED:END -->',
      featuredHtml
    )

    if (ok) console.log(`Updated featured slider in: ${BLOG_INDEX}`)
  } catch (err) {
    console.warn(
      'Skipped featured slider update due to error:',
      err?.message || err
    )
  }
})()
