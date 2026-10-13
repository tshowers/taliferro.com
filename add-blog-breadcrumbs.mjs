import fs from 'fs'
import path from 'path'

const ROOT = '/Users/tyshowers/Dropbox/Websites/taliferro-home/root/public/blog'

const SKIP = new Set([
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'toc.html')
])

function walk (dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

function getTagContent (html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = html.match(re)
  return m ? m[1].trim() : ''
}

function getCanonical (html) {
  const m = html.match(
    /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i
  )
  return m ? m[1].trim() : ''
}

function hasBreadcrumbList (html) {
  return /"@type"\s*:\s*"BreadcrumbList"/i.test(html)
}

function escapeJsonString (s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildBreadcrumbJsonLd (title, canonical) {
  const safeTitle = escapeJsonString(title || 'Article')
  const safeUrl = escapeJsonString(canonical)

  return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://taliferro.com/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://taliferro.com/blog/" },
    { "@type": "ListItem", "position": 3, "name": "Table of Contents", "item": "https://taliferro.com/blog/toc.html" },
    { "@type": "ListItem", "position": 4, "name": "${safeTitle}", "item": "${safeUrl}" }
  ]
}
</script>
`.trim()
}

function injectIntoHead (html, scriptBlock) {
  // Put it after canonical if present, otherwise right before <script src="/js/home-page-intent.js" defer></script></head>
  const canonicalIdx = html.search(/<link\s+[^>]*rel=["']canonical["']/i)
  if (canonicalIdx !== -1) {
    const endTagIdx = html.indexOf('>', canonicalIdx)
    if (endTagIdx !== -1) {
      return (
        html.slice(0, endTagIdx + 1) +
        '\n' +
        scriptBlock +
        '\n' +
        html.slice(endTagIdx + 1)
      )
    }
  }
  return html.replace(
    /<\/head>/i,
    `\n${scriptBlock}\n<script src="/js/home-page-intent.js" defer></script></head>`
  )
}

function main () {
  const files = walk(ROOT)

  let changed = 0
  let skipped = 0

  for (const file of files) {
    if (SKIP.has(file)) {
      skipped++
      continue
    }

    const html = fs.readFileSync(file, 'utf8')

    // only under /blog, but you asked "sub directories" — this skips /blog root itself
    const rel = path.relative(ROOT, file)
    const isSubdir = rel.includes(path.sep)
    if (!isSubdir) {
      skipped++
      continue
    }

    if (hasBreadcrumbList(html)) {
      skipped++
      continue
    }

    const title = getTagContent(html, 'title')
    const canonical = getCanonical(html)

    // If canonical missing, skip (don’t guess URLs)
    if (!canonical) {
      console.warn('NO CANONICAL, SKIP:', file)
      skipped++
      continue
    }

    const scriptBlock = buildBreadcrumbJsonLd(title, canonical)
    const updated = injectIntoHead(html, scriptBlock)

    fs.writeFileSync(file, updated, 'utf8')
    changed++
  }

  console.log(
    `Done. Changed: ${changed}, Skipped: ${skipped}, Total scanned: ${files.length}`
  )
}

main()
