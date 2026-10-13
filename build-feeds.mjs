#!/usr/bin/env node
// build-feeds.mjs
// Usage examples:
//   node root/build-feeds.mjs --root ./root/public --out ./root/public
//   node root/build-feeds.mjs --root ./root/public --out ./root/public --only-months --overwrite
//
// Flags:
//   --only-months               Scan only top-level month buckets (e.g., jan2025, sep2024, …)
//   --site <url>                Site root (default: https://taliferro.com/blog)
//   --overwrite                 Write directly to rss.xml / sitemap.xml (else *.generated.xml)
//   --rss-title <s>             Channel title (default: Taliferro - Blog)
//   --rss-desc <s>              Channel description
//   --rss-image <url>           Channel image/logo URL
//   --rss-category <s>          Channel category (default: Web Development)
//   --rss-author <s>            Default dc:creator (default: Tyrone Showers)
//   --rss-link <url>            Channel link/home (default: <site>/index.html)
//   --rss-self <url>            Self link to RSS (default: <site>/rss.xml)
//   --rss-lang <s>              Language code (default: en-us)
//   --no-sitemap               Do not write sitemap.xml (use artifacts builder for sitemaps).
//   --exclude <csv>            Comma-separated glob patterns to exclude (matches relative path), e.g., "thank-you.html,**/thank-you.html,drafts/**"
//   --division-feeds           Also write rss-tech.xml and rss-group.xml (based on <meta name="taliferro:division" content="tech|group">)
//   --rss-title-tech <s>       Tech feed channel title (default: <rss-title> - Tech)
//   --rss-title-group <s>      Group feed channel title (default: <rss-title> - Group)
//   --rss-desc-tech <s>        Tech feed channel description (default: <rss-desc>)
//   --rss-desc-group <s>       Group feed channel description (default: <rss-desc>)
//   --rss-category-tech <s>    Tech feed channel category (default: Taliferro Tech)
//   --rss-category-group <s>   Group feed channel category (default: Taliferro Group)

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// ---------- arg parsing ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const k = cur.slice(2)
      const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true
      acc.push([k, v])
    }
    return acc
  }, [])
)

const ROOT = path.resolve(args.root ?? '.')
const OUT_DIR = path.resolve(args.out ?? '.')
const ONLY_MONTHS = !!args['only-months']
const SITE = String(args.site ?? 'https://taliferro.com/blog').replace(
  /\/+$/,
  ''
)
const OVERWRITE = !!args.overwrite
const EMIT_ATOM = !!args.atom // enable Atom feed when --atom is provided
const EMIT_SITEMAP = !args['no-sitemap'] // default true; pass --no-sitemap to skip sitemap generation
const EMIT_DIVISION_FEEDS = !!args['division-feeds'] // when true, also emit rss-tech.xml + rss-group.xml

const RSS_TITLE = args['rss-title'] ?? 'Taliferro - Blog'
const RSS_DESC =
  args['rss-desc'] ?? 'Latest articles and announcements from Taliferro.'
const RSS_IMAGE =
  args['rss-image'] ??
  'https://taliferro.com/img/general/taliferro-group-logo.png'
const RSS_CATEGORY = args['rss-category'] ?? 'Business Momentum'
const RSS_AUTHOR = args['rss-author'] ?? 'Tyrone Showers'
const RSS_LINK = args['rss-link'] ?? `${SITE}/`
const RSS_SELF = args['rss-self'] ?? `${SITE}/rss.xml`
const RSS_LANG = args['rss-lang'] ?? 'en-us'
const WEBSUB_HUB = args['websub-hub'] ?? 'https://pubsubhubbub.appspot.com/' // pass empty string to disable

const RSS_TITLE_TECH = args['rss-title-tech'] ?? `${RSS_TITLE} - Tech`
const RSS_TITLE_GROUP = args['rss-title-group'] ?? `${RSS_TITLE} - Group`
const RSS_DESC_TECH = args['rss-desc-tech'] ?? RSS_DESC
const RSS_DESC_GROUP = args['rss-desc-group'] ?? RSS_DESC
const RSS_CATEGORY_TECH = args['rss-category-tech'] ?? 'Taliferro Tech'
const RSS_CATEGORY_GROUP = args['rss-category-group'] ?? 'Taliferro Group'
function extractDivision (html) {
  const raw =
    extractMetaContent(html, 'name', 'taliferro:division') ??
    extractMetaContent(html, 'property', 'taliferro:division') ??
    ''
  const v = String(raw).trim().toLowerCase()
  if (v === 'tech') return 'tech'
  if (v === 'group') return 'group'
  return null
}

function extractCategory (html, relPath) {
  const raw =
    extractMetaContent(html, 'name', 'taliferro:category') ??
    extractMetaContent(html, 'property', 'taliferro:category') ??
    ''

  const metaVal = String(raw).trim()
  if (metaVal) return metaVal

  const rp = String(relPath || '')
    .replace(/^\/+/, '')
    .toLowerCase()
  // Infer from path buckets under /blog/
  if (rp.startsWith('blog/')) {
    const parts = rp.split('/')
    const bucket = parts[1] || ''

    // Direct topic buckets
    if (bucket === 'ai') return 'AI Automation'
    if (bucket === 'bms') return 'Business Momentum'
    if (bucket === 'crm') return 'CRM Alternatives'
    if (bucket === 'lead-generation') return 'Lead Generation'
    if (bucket === 'outreach') return 'Outreach'
    if (bucket === 'responsible-tech' || bucket === 'responsible-use')
      return 'Responsible Technology'

    // If you keep year/month folders only, try to infer from deeper segments
    // e.g., blog/feb2026/feb012026/ai-adoption-...html
    const rest = parts.slice(2).join('/')
    if (/\b(bms|business-momentum)\b/.test(rest)) return 'Business Momentum'
    if (/\b(lead|lead-generation|prospect|outreach|follow-up)\b/.test(rest))
      return 'Lead Generation'
    if (
      /\b(ai|machine-learning|llm|genai|artificial-intelligence)\b/.test(rest)
    )
      return 'AI Automation'
    if (/\b(crm|hubspot|salesforce)\b/.test(rest)) return 'CRM Alternatives'
    if (/\b(api|integration|gateway)\b/.test(rest)) return 'API Design'
    if (/\b(cloud|azure|gcp|google-cloud|aws)\b/.test(rest))
      return 'Cloud Architecture'
  }

  return RSS_CATEGORY
}

// User-specified excludes: comma-separated globs against RELATIVE PATH (e.g., "thank-you.html,**/thank-you.html,drafts/**")
const EXCLUDE_RAW = String(args['exclude'] ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
// Conservative defaults for typical non-content pages
const DEFAULT_EXCLUDE_GLOBS = [
  'business-momentum-system-not-a-crm.html',
  'crm-alternative-story.html',
  'crm-alternative.html',
  'see-how-todd-automates-follow-ups.html',
  'todd-affiliate-program.html',
  'thank-you.html',
  'toc.html',
  '**/thank-you.html',
  '**/thanks.html',
  '**/submitted.html',
  '**/success.html',
  '**/x-template-single-post.html',
  '**/confirm*.html'
]
// Merge + de-dupe
const EXCLUDE_GLOBS = Array.from(
  new Set([...DEFAULT_EXCLUDE_GLOBS, ...EXCLUDE_RAW])
)
function globToRegex (glob) {
  // Normalize: strip leading slash for consistency
  let s = String(glob).replace(/^\/+/, '')
  // Protect double-star first, then escape regex metachars, then expand globs
  s = s.replace(/\*\*/g, '__DS__') // mark **
  s = s.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&') // escape regex specials (not * or ? because handled below)
  s = s.replace(/\*/g, '[^/]*') // single * => any chars except '/'
  s = s.replace(/\?/g, '.') // ? => any single char
  s = s.replace(/__DS__/g, '.*') // ** => match across path separators
  return new RegExp('^' + s + '$', 'i')
}
const EXCLUDE_REGEXES = EXCLUDE_GLOBS.map(globToRegex)
function isPathExcluded (relPath) {
  const relNoLead = relPath.replace(/^\//, '')
  return EXCLUDE_REGEXES.some(rx => rx.test(relNoLead))
}

// Limit sitemap to recently updated content (default: last 365 days). Override with --sitemap-days <n>
const SITEMAP_DAYS = Number.parseInt(args['sitemap-days'] ?? '365', 10)
const DAY_MS = 24 * 60 * 60 * 1000

// ---------- constants / helpers ----------
const INCLUDE_EXT = new Set(['.html', '.htm'])
const EXCLUDES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.angular',
  'css',
  'img',
  'js',
  'assets',
  'fonts',
  'IndexNow',
  'template-year'
])
const SKIP_BASENAMES = new Set([
  'toc.html',
  'toc.main.html',
  'index.html',
  '404.html',
  '410.html',
  'robots.txt',
  'rss.xml',
  'sitemap.xml',
  'thank-you.html'
])
const SKIP_NAME_REGEX = [
  /^google[0-9a-z]+\.html$/i, // Google site verification
  /^bing.*\.html$/i // Bing HTML verifier
]

const monthNameToNum = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12'
}
const MONTH_KEYS = Object.keys(monthNameToNum)
function isMonthBucket (name) {
  const m = String(name || '').toLowerCase()
  return /^[a-z]{3}20\d{2}$/.test(m) && MONTH_KEYS.includes(m.slice(0, 3))
}

function isHtml (p) {
  return INCLUDE_EXT.has(path.extname(p).toLowerCase())
}
function relFromRoot (abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/')
}
async function* walk (dir, depth = 0) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.isDirectory()) {
      if (EXCLUDES.has(e.name)) continue
      if (ONLY_MONTHS && depth === 0 && !isMonthBucket(e.name)) continue
      yield* walk(path.join(dir, e.name), depth + 1)
    } else {
      if (ONLY_MONTHS && depth === 0) continue // skip root-level files in months-only mode
      yield path.join(dir, e.name)
    }
  }
}
function parseJSONLDs (html) {
  const blocks = []
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1]))
    } catch {}
  }
  return blocks
}
function flatten (obj) {
  const arr = []
  if (Array.isArray(obj)) {
    for (const x of obj) arr.push(...flatten(x))
  } else if (obj && typeof obj === 'object') {
    arr.push(obj)
    if (obj['@graph']) arr.push(...flatten(obj['@graph']))
    if (obj.itemListElement) arr.push(...flatten(obj.itemListElement))
    if (obj.mainEntity) arr.push(...flatten(obj.mainEntity))
  }
  return arr
}
function findArticleNode (blocks) {
  const isArticleType = t =>
    (Array.isArray(t) ? t : [t])
      .map(x => String(x).toLowerCase())
      .some(v => v === 'article' || v === 'blogposting')
  for (const b of blocks) {
    for (const n of flatten(b)) {
      if (n && isArticleType(n['@type'])) return n
    }
  }
  return null
}
function extractTitle (html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}
function extractCanonical (html) {
  const m = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i)
  if (!m) return null
  const href = m[0].match(/\shref=["']([^"']+)["']/i)
  return href ? href[1].trim() : null
}
function extractMetaContent (html, attr, key) {
  const safeKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<meta\\s+[^>]*\\b${attr}\\s*=\\s*(["'])${safeKey}\\1[^>]*>`,
    'i'
  )
  const m = html.match(re)
  if (!m) return null

  const c = m[0].match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)
  return c ? String(c[2]).trim() : null
}
function extractDescription (html, art) {
  return (
    art?.description ?? extractMetaContent(html, 'name', 'description') ?? ''
  )
}
function extractOgImage (html, art) {
  const aimg = art?.image
  if (typeof aimg === 'string') return aimg
  if (Array.isArray(aimg) && aimg.length) {
    const first = aimg[0]
    if (typeof first === 'string') return first
    if (first?.url) return first.url
  }
  return (
    extractMetaContent(html, 'property', 'og:image') ??
    extractMetaContent(html, 'name', 'og:image') ??
    null
  )
}
function inferDatePublishedFromPath (relPath) {
  // looks for seg like sep012025 -> 2025-09-01
  const seg = relPath.split('/').find(s => /^[a-z]{3}\d{2}20\d{2}$/i.test(s))
  if (!seg) return null
  const mon = seg.slice(0, 3).toLowerCase()
  const day = seg.slice(3, 5)
  const year = seg.slice(5)
  const mm = monthNameToNum[mon]
  if (!mm) return null
  return `${year}-${mm}-${day}`
}
function rfc1123 (d) {
  return (d instanceof Date ? d : new Date(d)).toUTCString()
}
function rfc3339 (d) {
  const dt = d instanceof Date ? d : new Date(d)
  return dt.toISOString()
}
function xmlEsc (s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function extFromUrl (u) {
  try {
    const s = String(u || '')
    const clean = s.split('?')[0].split('#')[0]
    const ext = path.extname(clean).toLowerCase()
    return ext || ''
  } catch {
    return ''
  }
}
function mimeFromImageUrl (u) {
  const ext = extFromUrl(u)
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
  return 'image/*'
}

// ---------- main ----------
;(async () => {
  /** @type {Array<{title:string,url:string,relPath?:string,author?:string,description?:string,image?:string,division?:string,category?:string,datePublished?:string,datePublishedDate?:Date,dateModifiedISO?:string,dateModified?:Date}>} */
  const rows = []

  for await (const fileAbs of walk(ROOT)) {
    if (!isHtml(fileAbs)) continue
    const base = path.basename(fileAbs)
    if (SKIP_BASENAMES.has(base)) continue
    if (SKIP_NAME_REGEX.some(rx => rx.test(base))) continue

    const rel = relFromRoot(fileAbs)
    if (isPathExcluded(rel)) continue // skip excluded paths by glob
    let html = ''
    try {
      html = await fs.readFile(fileAbs, 'utf8')
    } catch {
      continue
    }

    const title = extractTitle(html) || base
    const canonical = extractCanonical(html)
    let url = canonical || '/' + rel

    // Normalize internal URLs so "/index.html" becomes the folder URL.
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

    const blocks = parseJSONLDs(html)
    const art = findArticleNode(blocks)

    // Prefer the publish date inferred from the URL path (e.g., jul122024) because some readers
    // (Flipboard in particular) are sensitive to date inconsistencies.
    const inferredPublished = inferDatePublishedFromPath(rel)
    let datePublished = art?.datePublished || inferredPublished
    if (datePublished && /^\d{4}-\d{2}-\d{2}T/.test(datePublished))
      datePublished = datePublished.slice(0, 10)

    // If JSON-LD datePublished exists but disagrees with the path-derived date, trust the path.
    if (
      inferredPublished &&
      datePublished &&
      datePublished !== inferredPublished
    ) {
      datePublished = inferredPublished
    }

    const datePublishedDate = datePublished
      ? new Date(`${datePublished}T00:00:00Z`)
      : undefined

    let dateModifiedISO = art?.dateModified
    let stat
    try {
      stat = await fs.stat(fileAbs)
    } catch {}
    if (!dateModifiedISO && stat) dateModifiedISO = stat.mtime.toISOString()
    const dateModified = dateModifiedISO
      ? new Date(dateModifiedISO)
      : stat?.mtime ?? new Date(0)

    const author =
      typeof art?.author === 'string'
        ? art.author
        : art?.author?.name || RSS_AUTHOR
    const description = extractDescription(html, art)
    const image = extractOgImage(html, art)
    const division = extractDivision(html) || 'group'
    const category = extractCategory(html, rel)

    // skip pages without a reasonable URL
    rows.push({
      title,
      url,
      relPath: rel,
      author,
      description,
      image,
      division,
      category,
      datePublished,
      datePublishedDate,
      dateModifiedISO,
      dateModified
    })
  }

  // Sort newest published first; if missing, fall back to modified
  rows.sort((a, b) => {
    const ap = a.datePublishedDate?.getTime() ?? a.dateModified?.getTime() ?? 0
    const bp = b.datePublishedDate?.getTime() ?? b.dateModified?.getTime() ?? 0
    return bp - ap
  })

  // ---------- Sitemap ----------
  if (EMIT_SITEMAP) {
    const nowISO = new Date().toISOString()
    const sixtyDaysMs = 60 * DAY_MS
    const nowMs = Date.now()
    const cutoffMs = nowMs - SITEMAP_DAYS * DAY_MS

    const entries = []
    entries.push({ loc: `${SITE}/`, lastmod: nowISO, priority: '1.00' })
    entries.push({ loc: `${SITE}/toc.html`, lastmod: nowISO, priority: '0.80' })

    // Only include posts updated within the past SITEMAP_DAYS (default 365)
    const recentRows = rows.filter(p => {
      const t =
        (p.dateModified instanceof Date
          ? p.dateModified.getTime()
          : undefined) ??
        (p.datePublishedDate instanceof Date
          ? p.datePublishedDate.getTime()
          : undefined)
      return typeof t === 'number' && !Number.isNaN(t) && t >= cutoffMs
    })

    for (const p of recentRows) {
      const abs = /^https?:/i.test(p.url)
        ? p.url
        : `${SITE}${p.url.startsWith('/') ? '' : '/'}${p.url}`
      const lm =
        p.dateModifiedISO ||
        (p.datePublished ? `${p.datePublished}T00:00:00Z` : nowISO)
      const pr = nowMs - Date.parse(lm) <= sixtyDaysMs ? '0.80' : '0.64'
      entries.push({
        loc: abs,
        lastmod: lm.replace(/Z$/, '+00:00'),
        priority: pr
      })
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${entries
  .map(
    e => `  <url>
    <loc>${xmlEsc(e.loc)}</loc>
    <lastmod>${xmlEsc(e.lastmod)}</lastmod>
    <priority>${e.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`
    const name = OVERWRITE ? 'sitemap.xml' : 'sitemap.generated.xml'
    await fs.writeFile(path.join(OUT_DIR, name), xml, 'utf8')
  }

  // ---------- RSS ----------
  {
    function buildRssItems (list, categoryOverride = null) {
      return list
        .filter(p => p.datePublished || p.dateModifiedISO)
        .map(p => {
          const abs = /^https?:/i.test(p.url)
            ? p.url
            : `${SITE}${p.url.startsWith('/') ? '' : '/'}${p.url}`
          const pub = p.datePublishedDate ?? p.dateModified ?? new Date()
          const imgType = p.image ? mimeFromImageUrl(p.image) : ''
          const enc = p.image
            ? `\n      <enclosure url="${xmlEsc(
                p.image
              )}" length="0" type="${xmlEsc(imgType)}" />`
            : ''
          const media = p.image
            ? `\n      <media:content url="${xmlEsc(
                p.image
              )}" medium="image" type="${xmlEsc(
                imgType
              )}" />\n      <media:thumbnail url="${xmlEsc(p.image)}" />`
            : ''
          return `    <item>
      <title>${xmlEsc(p.title)}</title>
      <link>${xmlEsc(abs)}</link>
      <guid isPermaLink="false">${xmlEsc(
        `taliferro:${String(p.relPath || abs)
          .replace(/^https?:\/\//i, '')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .toLowerCase()}`
      )}</guid>
      <pubDate>${xmlEsc(rfc1123(pub))}</pubDate>
      <description>${xmlEsc(p.description || '')}</description>
      <category>${xmlEsc(
        categoryOverride || p.category || RSS_CATEGORY
      )}</category>
      <dc:creator>${xmlEsc(p.author || RSS_AUTHOR)}</dc:creator>${enc}${media}
    </item>`
        })
        .join('\n')
    }

    function buildRssChannel ({
      title,
      link,
      self,
      desc,
      lang,
      category,
      imageUrl,
      itemsXml
    }) {
      const nowRfc1123 = rfc1123(new Date())
      const hubLink = WEBSUB_HUB
        ? `\n    <atom:link href="${xmlEsc(WEBSUB_HUB)}" rel="hub" />`
        : ''
      return `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"\n     xmlns:media="http://search.yahoo.com/mrss/"\n     xmlns:atom="http://www.w3.org/2005/Atom"\n     xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n    <title>${xmlEsc(
        title
      )}</title>\n    <link>${xmlEsc(
        link
      )}</link>\n    <atom:link href="${xmlEsc(
        self
      )}" rel="self" type="application/rss+xml" />${hubLink}\n    <description>${xmlEsc(
        desc
      )}</description>\n    <language>${xmlEsc(
        lang
      )}</language>\n    <category>${xmlEsc(
        category
      )}</category>\n    <lastBuildDate>${xmlEsc(
        nowRfc1123
      )}</lastBuildDate>\n    <generator>Taliferro feed builder (build-feeds.mjs)</generator>\n    <copyright>Taliferro Is Registered In The U.S. Patent And Trademark Office. All rights reserved.</copyright>\n    <image>\n      <url>${xmlEsc(
        imageUrl
      )}</url>\n      <title>${xmlEsc(title)}</title>\n      <link>${xmlEsc(
        link
      )}</link>\n    </image>\n${itemsXml}\n  </channel>\n</rss>\n`
    }

    const items = buildRssItems(rows)
    const channel = buildRssChannel({
      title: RSS_TITLE,
      link: RSS_LINK,
      self: RSS_SELF,
      desc: RSS_DESC,
      lang: RSS_LANG,
      category: RSS_CATEGORY,
      imageUrl: RSS_IMAGE,
      itemsXml: items
    })
    const name = OVERWRITE ? 'rss.xml' : 'rss.generated.xml'
    await fs.writeFile(path.join(OUT_DIR, name), channel, 'utf8')

    if (EMIT_DIVISION_FEEDS) {
      const isBlog = p => {
        const rp = String(p.relPath || '').replace(/^\/+/, '')
        return rp.toLowerCase().startsWith('blog/')
      }
      const techRows = rows.filter(
        p => isBlog(p) && (p.division || 'group') === 'tech'
      )
      const groupRows = rows.filter(
        p => isBlog(p) && (p.division || 'group') !== 'tech'
      )

      const rssSelfTech = String(RSS_SELF).replace(/rss\.xml$/i, 'rss-tech.xml')
      const rssSelfGroup = String(RSS_SELF).replace(
        /rss\.xml$/i,
        'rss-group.xml'
      )

      const techItems = buildRssItems(techRows, RSS_CATEGORY_TECH)
      const groupItems = buildRssItems(groupRows, RSS_CATEGORY_GROUP)

      const techChannel = buildRssChannel({
        title: RSS_TITLE_TECH,
        link: RSS_LINK,
        self: rssSelfTech,
        desc: RSS_DESC_TECH,
        lang: RSS_LANG,
        category: RSS_CATEGORY_TECH,
        imageUrl: RSS_IMAGE,
        itemsXml: techItems
      })
      const groupChannel = buildRssChannel({
        title: RSS_TITLE_GROUP,
        link: RSS_LINK,
        self: rssSelfGroup,
        desc: RSS_DESC_GROUP,
        lang: RSS_LANG,
        category: RSS_CATEGORY_GROUP,
        imageUrl: RSS_IMAGE,
        itemsXml: groupItems
      })

      const techName = OVERWRITE ? 'rss-tech.xml' : 'rss-tech.generated.xml'
      const groupName = OVERWRITE ? 'rss-group.xml' : 'rss-group.generated.xml'
      await fs.writeFile(path.join(OUT_DIR, techName), techChannel, 'utf8')
      await fs.writeFile(path.join(OUT_DIR, groupName), groupChannel, 'utf8')
    }

    if (EMIT_ATOM) {
      const atomItems = rows
        .filter(p => p.datePublished || p.dateModifiedISO)
        .map(p => {
          const abs = /^https?:/i.test(p.url)
            ? p.url
            : `${SITE}${p.url.startsWith('/') ? '' : '/'}${p.url}`
          const published = p.datePublishedDate
            ? rfc3339(p.datePublishedDate)
            : p.dateModifiedISO || rfc3339(new Date())
          const updated = p.dateModifiedISO || published
          const summary = p.description || ''
          const img = p.image
            ? `\n    <link rel="enclosure" type="image/webp" href="${xmlEsc(
                p.image
              )}"/>`
            : ''
          const id = `tag:${SITE.replace(/^https?:\/\//, '')},${
            p.datePublished || '0000-00-00'
          }:${abs.replace(/^https?:\/\//, '')}`
          return `  <entry>
    <id>${xmlEsc(id)}</id>
    <title>${xmlEsc(p.title)}</title>
    <link href="${xmlEsc(abs)}"/>
    <updated>${xmlEsc(updated)}</updated>
    <published>${xmlEsc(published)}</published>
    <author><name>${xmlEsc(p.author || RSS_AUTHOR)}</name></author>
    <summary type="html">${xmlEsc(summary)}</summary>${img}
  </entry>`
        })
        .join('\n')

      const atomHub = WEBSUB_HUB
        ? `\n  <link rel="hub" href="${xmlEsc(WEBSUB_HUB)}"/>`
        : ''
      const atomSelf = RSS_SELF.replace(/rss\.xml$/i, 'atom.xml')
      const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xmlEsc(RSS_TITLE)}</title>
  <link href="${xmlEsc(SITE)}/"/>
  <link rel="self" type="application/atom+xml" href="${xmlEsc(
    atomSelf
  )}"/>${atomHub}
  <updated>${xmlEsc(rfc3339(new Date()))}</updated>
  <id>tag:${xmlEsc(SITE.replace(/^https?:\/\//, ''))},feed:blog</id>
${atomItems}
</feed>
`
      const atomName = OVERWRITE ? 'atom.xml' : 'atom.generated.xml'
      await fs.writeFile(path.join(OUT_DIR, atomName), atom, 'utf8')
    }
  }

  const outputs = []
  const rssOut = path.join(OUT_DIR, OVERWRITE ? 'rss.xml' : 'rss.generated.xml')
  outputs.push(rssOut)
  if (EMIT_DIVISION_FEEDS) {
    outputs.push(
      path.join(OUT_DIR, OVERWRITE ? 'rss-tech.xml' : 'rss-tech.generated.xml')
    )
    outputs.push(
      path.join(
        OUT_DIR,
        OVERWRITE ? 'rss-group.xml' : 'rss-group.generated.xml'
      )
    )
  }
  if (EMIT_ATOM) {
    const atomOut = path.join(
      OUT_DIR,
      OVERWRITE ? 'atom.xml' : 'atom.generated.xml'
    )
    outputs.push(atomOut)
  }
  if (EMIT_SITEMAP) {
    const smOut = path.join(
      OUT_DIR,
      OVERWRITE ? 'sitemap.xml' : 'sitemap.generated.xml'
    )
    outputs.push(smOut)
  }
  console.log(
    `Feeds written:\n${outputs
      .map(f => `  - ${f}`)
      .join('\n')}\nSite root: ${SITE}\nFeed-eligible files: ${rows.length}`
  )
})()
