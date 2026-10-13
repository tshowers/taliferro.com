/**
 * blog-conversion.mjs
 *
 * Converts legacy blog posts (those containing `<div class="post__content clearfix">`)
 * into the new Taliferro blog format that uses `taliferro-styles.css`.
 *
 * Defaults to dry-run. Use `--write` to apply changes.
 *
 * Usage:
 *   node blog-conversion.mjs              # dry-run
 *   node blog-conversion.mjs --dry-run    # dry-run
 *   node blog-conversion.mjs --write      # writes + .bak backups
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const BLOG_DIR = path.join(ROOT, 'public', 'blog')

const args = new Set(process.argv.slice(2))
const WRITE = args.has('--write')
const DRY_RUN = !WRITE || args.has('--dry-run')

function stripTags (html = '') {
  return String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml (s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getSlug (filePath) {
  return path.basename(filePath).replace(/\.html$/i, '')
}

function pickIntent (tags = []) {
  const t = tags.map(x => String(x).toLowerCase())
  if (
    t.some(
      x =>
        x.includes('api') ||
        x.includes('gateway') ||
        x.includes('microservices')
    )
  )
    return 'api_design'
  if (
    t.some(
      x =>
        x.includes('website') ||
        x.includes('performance') ||
        x.includes('seo') ||
        x.includes('speed')
    )
  )
    return 'website_performance'
  if (t.some(x => x.includes('machine learning') || x.includes('ai')))
    return 'ai_ml'
  return 'blog'
}

function ensureTaliferroStyles (
  headHtml,
  depthToRootCss = '../../../css/taliferro-styles.css'
) {
  // Remove legacy CSS includes
  let out = headHtml
    .replace(/<link[^>]+href=["'][^"']*fonts\.googleapis\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]+href=["'][^"']*\/css\/vendor\.css[^>]*>\s*/gi, '')
    .replace(/<link[^>]+href=["'][^"']*\/css\/main\.css[^>]*>\s*/gi, '')

  const hasTaliferro = /taliferro-styles\.css/i.test(out)
  if (!hasTaliferro) {
    // Insert before <script src="/js/home-page-intent.js" defer></script></head> (or at end if missing)
    const linkTag = `  <link rel="stylesheet" type="text/css" href="${depthToRootCss}">\n`
    if (/<\/head>/i.test(out))
      out = out.replace(
        /<\/head>/i,
        `${linkTag}<script src="/js/home-page-intent.js" defer></script></head>`
      )
    else out = out + `\n${linkTag}`
  }

  return out
}

function extractBetween (html, startRe, endRe) {
  const start = html.search(startRe)
  if (start < 0) return null
  const startMatch = html.match(startRe)
  if (!startMatch) return null

  const startIdx = start + startMatch[0].length
  const rest = html.slice(startIdx)
  const end = rest.search(endRe)
  if (end < 0) return null
  return rest.slice(0, end)
}

function extractHeroImage (bodyHtml) {
  // Preferred: lazy-bg data-src
  const m = bodyHtml.match(
    /<div\s+class=["']lazy-bg["'][^>]*data-src=["']([^"']+)["'][^>]*>/i
  )
  if (m?.[1]) return m[1]

  // Fallback: og:image
  const og = bodyHtml.match(
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']\s*\/?\s*>/i
  )
  if (og?.[1]) return og[1]

  return ''
}

function extractTitle (headHtml, bodyHtml) {
  const h1 = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1?.[1]) return stripTags(h1[1])

  const t = headHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (t?.[1]) return stripTags(t[1])

  return 'Blog Post'
}

function extractPublishedUpdated (bodyHtml) {
  const pub = bodyHtml.match(/Published:\s*([^<\n]+)</i)
  const upd = bodyHtml.match(/Updated:\s*([^<\n]+)</i)

  const published = pub?.[1]?.trim() || ''
  const updated = upd?.[1]?.trim() || ''

  if (published && updated)
    return `Published: ${published} · Updated: ${updated}`
  if (published) return `Published: ${published}`
  if (updated) return `Updated: ${updated}`
  return ''
}

function extractAuthor (bodyHtml) {
  // Look for "By <a ...>Name</a>"
  const by = bodyHtml.match(
    /By\s*<a[^>]*href=["']([^"']+)["'][^>]*>\s*([^<]+)\s*<\/a>/i
  )
  const name = by?.[2]?.trim() || 'Taliferro'
  const url = by?.[1]?.trim() || 'https://taliferro.com/team/tyrone-showers/'
  return { name, url }
}

function extractTags (bodyHtml) {
  const tags = []
  const tagBlock = bodyHtml.match(
    /<div[^>]+class=["'][^"']*post__tags[\s\S]*?<\/div>\s*<\/div>/i
  )
  if (!tagBlock?.[0]) return tags

  const ems = tagBlock[0].match(/<em[^>]*>([\s\S]*?)<\/em>/gi) || []
  for (const em of ems) {
    const label = stripTags(em)
    if (label) tags.push(label)
  }

  // De-dupe
  return Array.from(new Set(tags))
}

function convertLegacyGalleryToGrid (contentHtml) {
  // Converts:
  // <div class="row gallery"> ... <div class="col-lg-6"><img ...></div> <div class="col-lg-6"><img ...></div> ...</div>
  // into:
  // <div class="grid grid-2"><div>...</div><div>...</div></div>

  return contentHtml.replace(
    /<div\s+class=["']row\s+gallery["'][^>]*>([\s\S]*?)<\/div>/gi,
    (_m, inner) => {
      const imgs = inner.match(/<img\s+[^>]*>/gi) || []
      if (imgs.length < 2) {
        // keep as-is if not the expected two-image gallery
        return `<div class="card">${inner}</div>`
      }

      const a = imgs[0]
      const b = imgs[1]
      return (
        `<div class="grid grid-2">` +
        `<div>${a}</div>` +
        `<div>${b}</div>` +
        `</div>`
      )
    }
  )
}

function removeLegacyTagsBlock (contentHtml) {
  // Remove post__tags blocks
  return contentHtml.replace(
    /<div[^>]+class=["'][^"']*post__tags[\s\S]*?<\/div>\s*<\/div>/gi,
    ''
  )
}

function removeEmptyHeadings (contentHtml) {
  return contentHtml.replace(/<h2>\s*<\/h2>/gi, '')
}

function buildNewBody ({
  title,
  pubUpdLine,
  heroImage,
  author,
  tags,
  contentHtml,
  slug
}) {
  const tagsList = tags.length
    ? `<p class="quote">Tags</p>\n          <ul class="list">\n            ${tags
        .map(t => `<li>${escapeHtml(t)}</li>`)
        .join('\n            ')}\n          </ul>`
    : ''

  const intent = pickIntent(tags)

  return `
<body>
  <!-- HERO -->
  <header class="hero">
    <div class="wrap">
      <div class="kicker">Home › Blog</div>

      <div class="hero-grid">
        <div>
          <h1>${escapeHtml(title)}</h1>
          ${pubUpdLine ? `<p class="fine">${escapeHtml(pubUpdLine)}</p>` : ''}

          <div class="btnrow">
            <a class="btn primary" href="../../">Blog home</a>
            <a class="btn ghost" href="../../toc.html">Browse topics</a>
          </div>

          <div class="card" style="margin-top:16px;">
            <p class="quote">By <a href="${escapeHtml(
              author.url
            )}">${escapeHtml(author.name)}</a></p>
            <p class="fine">Co-Founder Taliferro</p>
          </div>
        </div>

        <div class="hero-media">
          <div class="ph">
            ${
              heroImage
                ? `<img src="${escapeHtml(heroImage)}" alt="${escapeHtml(
                    title
                  )}" loading="lazy" />`
                : ''
            }
          </div>
        </div>
      </div>

      <div class="bottom-pad" aria-hidden="true"></div>
    </div>
  </header>

  <!-- ARTICLE -->
  <section class="section" aria-label="Article">
    <div class="wrap">
      <div class="kicker">Article</div>

      <div class="card">
        <div class="post__content clearfix">
${contentHtml
  .trim()
  .split('\n')
  .map(l => '          ' + l)
  .join('\n')}

          <div class="divider"></div>

          ${tagsList}
        </div>
      </div>

      <div class="divider"></div>

      <div class="card">
        <p class="quote">Want this fixed on your site?</p>
        <p>
          Tell us your URL and what feels slow.
          We’ll point to the first thing to fix.
        </p>
        <div class="btnrow" style="margin-top:10px;">
          <a class="btn primary" href="/?intent=${encodeURIComponent(
            intent
          )}&source=blog_cta&page=${encodeURIComponent(
    slug
  )}">Tell us what’s stuck</a>
          <a class="btn ghost" href="../../toc.html">Browse topics</a>
        </div>
      </div>

      <div class="bottom-pad" aria-hidden="true"></div>
    </div>
  </section>

  <div class="sticky-cta" role="region" aria-label="Blog call to action">
    <div class="wrap">
      <div>
        <div class="kicker">Need help?</div>
        <div class="quote" style="margin:0">Tell us what feels slow. We’ll point to the fix.</div>
      </div>
      <div class="btnrow" style="margin-top:0">
        <a class="btn primary" href="/?intent=${encodeURIComponent(
          intent
        )}&source=blog_sticky_cta&page=${encodeURIComponent(
    slug
  )}">Tell us what’s stuck</a>
        <a class="btn ghost" href="../../toc.html">Browse topics</a>
      </div>
    </div>
  </div>
</body>
`.trim()
}

async function walk (dir) {
  const out = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walk(p)))
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) {
      // Skip known non-post pages
      const base = e.name.toLowerCase()
      if (base === 'toc.html' || base === 'index.html') continue
      out.push(p)
    }
  }
  return out
}

function splitHeadBody (html) {
  const head = extractBetween(html, /<head[^>]*>/i, /<\/head>/i)
  const body = extractBetween(html, /<body[^>]*>/i, /<\/body>/i)
  const headFull =
    head != null ? html.match(/<head[^>]*>[\s\S]*?<\/head>/i)?.[0] || '' : ''
  const bodyFull =
    body != null ? html.match(/<body[^>]*>[\s\S]*?<\/body>/i)?.[0] || '' : ''
  return { headFull, bodyFull }
}

async function convertFile (filePath) {
  const html = await fs.readFile(filePath, 'utf8')
  if (!html.includes('post__content clearfix'))
    return { changed: false, reason: 'not-a-post' }

  const { headFull } = splitHeadBody(html)
  if (!headFull) return { changed: false, reason: 'no-head' }

  const headClean = ensureTaliferroStyles(headFull)

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyHtml = bodyMatch?.[1] || ''

  const title = extractTitle(headFull, bodyHtml)
  const pubUpdLine = extractPublishedUpdated(bodyHtml)
  const heroImage = extractHeroImage(html)
  const author = extractAuthor(bodyHtml)
  const tags = extractTags(bodyHtml)
  const slug = getSlug(filePath)

  const contentInner =
    extractBetween(
      html,
      /<div\s+class=["']post__content\s+clearfix["'][^>]*>/i,
      /<\/div>\s*<\/article>/i
    ) ||
    extractBetween(
      html,
      /<div\s+class=["']post__content\s+clearfix["'][^>]*>/i,
      /<\/div>\s*<div\s+class=["']section-blog__wrapper-pagination/i
    ) ||
    extractBetween(
      html,
      /<div\s+class=["']post__content\s+clearfix["'][^>]*>/i,
      /<\/div>\s*<\/body>/i
    )

  if (!contentInner) return { changed: false, reason: 'no-content' }

  let content = contentInner
  content = convertLegacyGalleryToGrid(content)
  content = removeLegacyTagsBlock(content)
  content = removeEmptyHeadings(content)

  const newBody = buildNewBody({
    title,
    pubUpdLine,
    heroImage,
    author,
    tags,
    contentHtml: content,
    slug
  })

  const outHtml = html
    .replace(/<head[^>]*>[\s\S]*?<\/head>/i, headClean)
    .replace(/<body[^>]*>[\s\S]*?<\/body>/i, newBody)

  return { changed: outHtml !== html, outHtml }
}

async function main () {
  const files = await walk(BLOG_DIR)
  const touched = []
  const skipped = []

  for (const f of files) {
    try {
      const res = await convertFile(f)
      if (!res.changed) {
        skipped.push({ f, reason: res.reason || 'no-change' })
        continue
      }

      if (DRY_RUN) {
        touched.push(f)
        continue
      }

      const bak = f + '.bak'
      await fs.copyFile(f, bak)
      await fs.writeFile(f, res.outHtml, 'utf8')
      touched.push(f)
    } catch (e) {
      skipped.push({ f, reason: `error: ${e?.message || e}` })
    }
  }

  if (DRY_RUN) {
    console.log(
      `\n[blog-conversion] DRY RUN: would update ${touched.length} file(s)\n`
    )
    touched
      .slice(0, 200)
      .forEach(p => console.log('  - ' + path.relative(ROOT, p)))
    if (touched.length > 200)
      console.log(`  ... and ${touched.length - 200} more`)
  } else {
    console.log(
      `\n[blog-conversion] WROTE ${touched.length} file(s) (each saved a .bak)\n`
    )
    touched
      .slice(0, 200)
      .forEach(p => console.log('  - ' + path.relative(ROOT, p)))
    if (touched.length > 200)
      console.log(`  ... and ${touched.length - 200} more`)
  }

  if (skipped.length) {
    console.log(`\n[blog-conversion] Skipped ${skipped.length} file(s)\n`)
    skipped
      .slice(0, 50)
      .forEach(x =>
        console.log(`  - ${path.relative(ROOT, x.f)} (${x.reason})`)
      )
    if (skipped.length > 50)
      console.log(`  ... and ${skipped.length - 50} more`)
  }

  console.log('\nDone.\n')
}

await main()
