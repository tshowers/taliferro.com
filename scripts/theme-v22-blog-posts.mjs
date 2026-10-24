#!/usr/bin/env node
/**
 * theme-v22-blog-posts.mjs
 *
 * Applies the v22 "Blog post" template to every dated blog post. The article
 * body (.post__content) is kept as-is apart from stripping trailing colons
 * from its H2s. Everything around it is rebuilt:
 *   - hero: breadcrumb, H1 (+ subtitle/summary when the post has them),
 *     author row with date (from datePublished) and read time (words / 230)
 *   - two columns: article + sticky aside ("In this post" TOC from h2[id],
 *     and a dark Rescue card picked by the post's category)
 *   - callout, tag pills, "Want this fixed" card, prev/next cards
 * <head>, JSON-LD, meta tags, scripts and the footer are not touched.
 *
 * Posts already converted (they contain class="post-layout") are skipped.
 *
 * Usage:
 *   node root/scripts/theme-v22-blog-posts.mjs [--dry-run] [--file public/blog/...html]
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('../public', import.meta.url).pathname;
const BLOG = join(ROOT, 'blog');
const DRY_RUN = process.argv.includes('--dry-run');
const fileArg = process.argv.indexOf('--file');
const ONLY = fileArg > -1 ? join(ROOT, '..', process.argv[fileArg + 1]) : null;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Service page a post bridges to -> breadcrumb label and Rescue key
const SERVICES = {
  'machine-learning-services': { label: 'Machine Learning', rescue: 'data' },
  'cloud-architecture-consulting': { label: 'Cloud Architecture', rescue: 'cloud' },
  'api-design-services': { label: 'API', rescue: 'data' },
  'agile-coaching': { label: 'Agile Coaching', rescue: 'delivery' },
  'website-development': { label: 'Web Development', rescue: 'legacy' },
  'ecommerce-development': { label: 'E-Commerce', rescue: 'legacy' },
};
// meta[name="taliferro:category"] values -> service slug
const META_CATEGORIES = {
  'API': 'api-design-services',
  'Agile Coaching': 'agile-coaching',
  'Cloud Architecture': 'cloud-architecture-consulting',
};
const RESCUES = {
  data: { kicker: 'Rescue · Data', title: 'Fix unreliable data before it costs more', href: '/rescue-me/data-quality/' },
  cloud: { kicker: 'Rescue · Cloud', title: 'Stop overpaying for infrastructure', href: '/rescue-me/cloud-cost-control/' },
  delivery: { kicker: 'Rescue · Delivery', title: 'Remove the bottleneck slowing every release', href: '/rescue-me/ship-faster/' },
  legacy: { kicker: 'Rescue · Legacy', title: 'Rebuild or patch? Get one honest answer', href: '/rescue-me/rebuild-vs-patch/' },
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// Returns [start, end) of the balanced <tag ...>...</tag> element that opens at `start`.
function balanced(html, start, tag, lenient = false) {
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return [start, m.index + m[0].length];
  }
  if (lenient) return [start, html.length]; // unclosed: runs to the end of its parent, as browsers treat it
  throw new Error(`unbalanced <${tag}> at ${start}`);
}

// Finds the first element matching `openRe` (an opening-tag regex) and returns its outer HTML and bounds.
function element(html, openRe, tag, from = 0) {
  const re = new RegExp(openRe.source, 'g');
  re.lastIndex = from;
  const m = re.exec(html);
  if (!m) return null;
  const [s, e] = balanced(html, m.index, tag);
  return { start: s, end: e, html: html.slice(s, e) };
}

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr']);

// Splits an HTML fragment into its top-level nodes (elements and non-blank text).
function children(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { if (html.slice(i).trim()) out.push({ tag: '#text', html: html.slice(i) }); break; }
    if (lt > i && html.slice(i, lt).trim()) out.push({ tag: '#text', html: html.slice(i, lt) });
    if (html.startsWith('<!--', lt)) { i = html.indexOf('-->', lt) + 3; continue; }
    const tag = html.slice(lt + 1).match(/^([a-zA-Z][a-zA-Z0-9]*)/)[1].toLowerCase();
    const openEnd = html.indexOf('>', lt) + 1;
    if (VOID.has(tag) || html[openEnd - 2] === '/') { out.push({ tag, html: html.slice(lt, openEnd) }); i = openEnd; continue; }
    const [, end] = balanced(html, lt, tag, true);
    const el = html.slice(lt, end);
    out.push({ tag, html: /<\/[a-z0-9]+>$/i.test(el) ? el : `${el}</${tag}>` });
    i = end;
  }
  return out;
}

const inner = (el) => el.slice(el.indexOf('>') + 1, el.lastIndexOf('</'));
const hasClass = (el, cls) => new RegExp(`^<[a-z]+[^>]*\\bclass="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"`).test(el);

// Splits a .post__tags block into its tag list and whatever else it holds (e.g. related reading).
function splitTags(h) {
  let body = inner(h);
  const list = body.match(/<ul class="list">([\s\S]*?)<\/ul>/);
  const cloud = body.match(/<div class="tagcloud">\s*<ul>([\s\S]*?)<\/ul>\s*<\/div>/);
  // The cloud's items carry internal links; the plain list mostly repeats them, so
  // take the cloud and add any list items it doesn't already have.
  const items = (m) => (m ? [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)] : [])
    .map((li) => li[1].replace(/<\/?(em|span)[^>]*>/g, '').replace(/\s+/g, ' ').trim())
    .filter((t) => text(t));
  const key = (t) => text(t).toLowerCase().replace(/[^a-z0-9]/g, '');
  const tags = items(cloud);
  for (const t of items(list)) if (!tags.some((c) => key(c) === key(t))) tags.push(t);
  for (const m of [list, cloud]) if (m) body = body.replace(m[0], '');
  body = body.replace(/<p class="quote">Tags<\/p>/, '').replace(/<div class="divider"><\/div>/g, '').trim();
  return { tags, rest: body };
}

const text = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function serviceFor(html) {
  const meta = html.match(/<meta name="taliferro:category" content="([^"]*)"/);
  if (meta && META_CATEGORIES[meta[1]]) return META_CATEGORIES[meta[1]];
  const cta = html.match(/href="https:\/\/taliferro\.com\/([a-z-]+)\/" data-intent="blog"/);
  if (cta && SERVICES[cta[1]]) return cta[1];
  const bridge = html.match(/data-link-bridge="true">[^<]*<a href="https:\/\/taliferro\.com\/([a-z-]+)\/"/);
  if (bridge && SERVICES[bridge[1]]) return bridge[1];
  return null;
}

function rescueCard(service) {
  const r = service && RESCUES[SERVICES[service].rescue];
  if (!r) {
    return `          <div class="post-rescue">
            <div class="post-rescue__kicker">Same-day help</div>
            <div class="post-rescue__title">What's broken right now?</div>
            <p>Pick the problem. Get one focused session and a written recommendation the same day.</p>
            <a class="button" href="/#triage" data-source="blog_aside">Start triage</a>
          </div>`;
  }
  return `          <div class="post-rescue">
            <div class="post-rescue__kicker">${r.kicker}</div>
            <div class="post-rescue__title">${r.title}</div>
            <p>$999 flat. Written plan in 3 days.</p>
            <a class="button" href="${r.href}" data-source="blog_aside">See the Rescue</a>
          </div>`;
}

function transform(html, rel) {
  if (html.includes('post-layout"')) return { skipped: 'already converted' };
  if (!html.includes('class="post__content')) return { skipped: 'no .post__content' };

  const warnings = [];

  // --- Hero ---------------------------------------------------------------
  const heroStart = html.search(/(<!-- HERO -->\s*)?<header class="hero">/);
  const heroEl = element(html, /<header class="hero">/, 'header');
  const hero = heroEl.html;
  const h1 = hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].trim();
  const subtitle = hero.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  const dek = hero.match(/<p(?![^>]*class="(?:fine|quote)")[^>]*>([\s\S]*?)<\/p>/);
  // Anything in the hero besides the pieces above, the buttons and the author card?
  const heroLeft = hero
    .replace(/<h1[\s\S]*?<\/h1>/, '').replace(/<h2[\s\S]*?<\/h2>/, '')
    .replace(dek ? dek[0] : '', '').replace(/<p class="fine">\s*(Published|Updated|Co-Founder)[\s\S]*?<\/p>/g, '')
    .replace(/<div class="btnrow">[\s\S]*?<\/div>/, '').replace(/<p class="quote">[\s\S]*?<\/p>/, '');
  if (text(heroLeft)) warnings.push(`hero has extra content: "${text(heroLeft).slice(0, 80)}"`);

  // --- Article section ----------------------------------------------------
  const articleEl = element(html, /<section class="section" aria-label="Article">/, 'section', heroEl.end);
  if (!articleEl) throw new Error('no article section');
  const between = html.slice(heroEl.end, articleEl.start).replace(/<!--[\s\S]*?-->/g, '');
  if (between.trim()) warnings.push('content between hero and article');
  const article = articleEl.html;

  // Walk the article section. Known pieces are pulled out and rebuilt; anything
  // unrecognized (FAQs, related reading, custom CTAs) is kept verbatim in order.
  // (A stray </div> in some posts closes .page-shell early, so walk the whole section.)
  const sectionNodes = children(inner(article));
  if (!sectionNodes.some((n) => hasClass(n.html, 'page-shell'))) throw new Error('no page-shell in article section');
  let content = null;
  let callout = '';
  let tags = [];
  let cta = null;
  let navLinks = [];
  const extras = [];

  function visit(nodes, out) {
    let recognized = false;
    for (const n of nodes) {
      const h = n.html;
      const isQuote = n.tag === 'p' && hasClass(h, 'quote');
      if (hasClass(h, 'divider') || hasClass(h, 'bottom-pad') || (hasClass(h, 'kicker') && text(h) === 'Article')) continue;
      if (isQuote && text(h) === 'More from the blog') { recognized = true; continue; }
      if (hasClass(h, 'post__content')) { content = h; recognized = true; continue; }
      if (hasClass(h, 'callout') && !callout) { callout = h; recognized = true; continue; }
      if (hasClass(h, 'post__tags')) {
        const split = splitTags(h);
        if (split.tags.length) { tags = split.tags; recognized = true; }
        if (split.rest) out.push(split.rest); // e.g. a "Related reading" block living in the tags slot
        continue;
      }
      if (n.tag === 'nav' && hasClass(h, 'post-nav')) {
        navLinks = [...h.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
        recognized = true;
        continue;
      }
      if (!cta && n.tag === 'div' && hasClass(h, 'btnrow') && /<a class="button/.test(h)) {
        // CTA: heading and body are the p.quote / p just before the buttons
        const body = out.length && /^<p(?![^>]*class="quote")/.test(out[out.length - 1]) ? out.pop() : null;
        const heading = out.length && /^<p class="quote"/.test(out[out.length - 1]) ? out.pop() : null;
        const buttons = [...h.matchAll(/<a class="button[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
        if (!buttons.some((b) => b.includes('button-primary'))) buttons[0] = buttons[0].replace('class="button"', 'class="button button-primary"');
        cta = { heading: heading ? text(heading) : 'Want this fixed on your site?', body: body ? text(body) : '', buttons };
        recognized = true;
        continue;
      }
      if (n.tag === 'div' && hasClass(h, 'card')) {
        const own = [];
        if (visit(children(inner(h)), own)) out.push(...own);
        else out.push(h); // nothing recognized inside: keep the card whole
        continue;
      }
      out.push(h);
    }
    return recognized;
  }
  visit(sectionNodes.flatMap((n) => (hasClass(n.html, 'page-shell') ? children(inner(n.html)) : [n])), extras);
  if (!content) throw new Error('post__content not found at the expected depth');

  // Some posts keep the callout and tags as the last children of .post__content
  if (!callout || !tags.length) {
    const kids = children(inner(content));
    const keep = kids.filter((k) => {
      if (!callout && hasClass(k.html, 'callout')) { callout = k.html; return false; }
      if (!tags.length && hasClass(k.html, 'post__tags')) {
        const split = splitTags(k.html);
        if (split.tags.length) {
          tags = split.tags;
          k.html = split.rest;
          return Boolean(split.rest);
        }
      }
      return true;
    });
    if (keep.length !== kids.length || keep.some((k, i) => k.html !== kids[i].html)) {
      const open = content.slice(0, content.indexOf('>') + 1);
      content = `${open}\n          ${keep.map((k) => k.html).join('\n          ')}\n        </div>`;
    }
  }

  // Strip trailing colons from H2s ("The Problem:" -> "The Problem")
  content = content.replace(/(<h2[^>]*>(?:(?!<\/h2>)[\s\S])*?):(\s*(?:<\/[a-z]+>\s*)*)<\/h2>/g, '$1$2</h2>');
  // Callouts lose the v21 inline rule and spacing utilities
  const cleanCallout = (s) => s.replace(/<div class="callout[^"]*"(\s*style="border-left:4px solid #222")?/g, '<div class="callout"');
  content = cleanCallout(content);
  callout = cleanCallout(callout);
  if (extras.length) warnings.push(`kept ${extras.length} extra block(s): "${text(extras.join(' ')).slice(0, 70)}"`);

  // --- Derived values -----------------------------------------------------
  const published = (html.match(/"datePublished":\s*"(\d{4}-\d{2}-\d{2})/) || [])[1];
  if (!published) warnings.push('no datePublished');
  const words = text(content).split(' ').length;
  const minutes = Math.max(1, Math.round(words / 230));
  const service = serviceFor(html);
  const heroCategory = (hero.match(/<p class="fine">[^<]*Category:\s*([^<·]+)/) || [])[1];
  const category = heroCategory ? heroCategory.trim() : service ? SERVICES[service].label : 'Articles';

  const toc = [...content.matchAll(/<h2[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)]
    .map((m) => [m[1], text(m[2]).replace(/:$/, '')])
    .filter(([, t]) => t);

  // --- Build --------------------------------------------------------------
  const out = [];
  out.push(`<!-- HERO -->
  <header class="hero post-hero">
    <div class="page-shell">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/blog/">Blog</a><span aria-hidden="true">/</span><span>${category}</span></nav>
      <h1>${h1}</h1>`);
  if (subtitle) out.push(`      <h2 class="post-sub">${subtitle[1].trim()}</h2>`);
  if (dek) out.push(`      <p class="post-dek">${dek[1].trim()}</p>`);
  out.push(`      <div class="byline">
        <span class="byline__avatar" aria-hidden="true">TS</span>
        <span class="byline__text">
          <a class="byline__name" href="/team/tyrone-showers/">Tyrone Showers</a>
          <span class="byline__meta">Co-Founder Taliferro${published ? ` · <time datetime="${published}">${formatDate(published)}</time>` : ''} · ${minutes} min read</span>
        </span>
      </div>
    </div>
  </header>
  <!-- ARTICLE -->
  <section class="section post-body" aria-label="Article">
    <div class="page-shell post-layout">
      <article class="post-article">
        ${content}`);
  if (extras.length) out.push(`        <div class="post-extras">\n          ${extras.join('\n          ')}\n        </div>`);
  if (callout) out.push(`        ${callout}`);
  if (tags.length) {
    out.push(`        <ul class="post-tags" aria-label="Tags">
${tags.map((t) => `          <li>${t}</li>`).join('\n')}
        </ul>`);
  }
  out.push(`      </article>
      <aside class="post-aside no-print">`);
  if (toc.length >= 2) {
    out.push(`        <nav class="post-toc" aria-label="In this post">
          <div class="kicker">In this post</div>
${toc.map(([id, t]) => `          <a href="#${id}">${esc(t)}</a>`).join('\n')}
        </nav>`);
  }
  out.push(rescueCard(service).replace(/^ {10}/gm, '        '));
  out.push(`      </aside>
    </div>
  </section>
  <section class="section post-end no-print" aria-label="Next steps">
    <div class="page-shell">`);
  if (cta) {
    out.push(`      <div class="post-cta">
        <div>
          <h2>${esc(cta.heading)}</h2>${cta.body ? `\n          <p>${esc(cta.body)}</p>` : ''}
        </div>
        <div class="btnrow">
          ${cta.buttons.join('\n          ')}
        </div>
      </div>`);
  }
  if (navLinks.length) {
    out.push(`      <nav class="post-nav" aria-label="Post navigation">`);
    for (const [, href, label] of navLinks) {
      const isPrev = /&larr;|←/.test(label);
      const title = text(label.replace(/&larr;|&rarr;|←|→/g, ''));
      out.push(`        <a class="post-nav__link${isPrev ? '' : ' post-nav__link--next'}" href="${href}">
          <span class="post-nav__dir">${isPrev ? '← Previous' : 'Next →'}</span>
          <span class="post-nav__title">${title}</span>
        </a>`);
    }
    out.push(`      </nav>`);
  }
  out.push(`    </div>
  </section>`);

  const result = html.slice(0, heroStart) + out.join('\n') + html.slice(articleEl.end);
  return { html: result, warnings, info: { category, minutes, toc: toc.length, tags: tags.length } };
}

const files = ONLY ? [ONLY] : walk(BLOG);
const stats = { converted: 0, skipped: {}, warnings: 0, categories: {} };
for (const file of files) {
  const rel = relative(ROOT, file);
  const html = readFileSync(file, 'utf8');
  let res;
  try {
    res = transform(html, rel);
  } catch (err) {
    console.log(`ERROR ${rel}: ${err.message}`);
    continue;
  }
  if (res.skipped) {
    stats.skipped[res.skipped] = (stats.skipped[res.skipped] || 0) + 1;
    continue;
  }
  for (const w of res.warnings) {
    console.log(`WARN ${rel}: ${w}`);
    stats.warnings++;
  }
  stats.converted++;
  stats.categories[res.info.category] = (stats.categories[res.info.category] || 0) + 1;
  if (!DRY_RUN) writeFileSync(file, res.html);
}
console.log(`${DRY_RUN ? '[dry run] ' : ''}converted ${stats.converted}, warnings ${stats.warnings}`);
console.log('skipped:', stats.skipped);
console.log('categories:', stats.categories);
