#!/usr/bin/env node
// build-site-artifacts.mjs
// Scans /public and emits:
//  - /public/sitemap.xml (index) + per-section sitemaps
//  - /public/blog/rss.xml (optional) + /public/blog/toc.itemlist.jsonld + /public/blog/toc.main.html
//
// Usage examples:
//   node root/build-site-artifacts.mjs --root ./root/public --site https://taliferro.com --overwrite --emit-atom
//
// Flags:
//   --root <dir>             Content root (default .)
//   --site <url>             Absolute site base (default https://taliferro.com)  <-- IMPORTANT
//   --overwrite              Write to sitemap.xml/rss.xml (not *.generated.xml)
//   --emit-atom              Also emit blog/atom.xml
//   --include-modified       Include "Modified" column in blog TOC HTML
//   --sitemap-days <n>       Blog sitemap filter: include only pages modified in the last n days (default 365). Use 0 to include all.
//   --section <name> ...     Optional: limit to specific top-level dirs (repeatable)
//                            If omitted, auto-detects all "sections" and static root pages.

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, cur, i, arr) => {
    if (cur.startsWith("--")) {
      const k = cur.slice(2);
      const v = arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true;
      a.push([k, v]);
    }
    return a;
  }, [])
);

const ROOT = path.resolve(args.root ?? ".");
const SITE = String(args.site ?? "https://taliferro.com").replace(/\/+$/, "");
const OVERWRITE = !!args.overwrite;
const EMIT_ATOM = !!args["emit-atom"];
const INCLUDE_MODIFIED = !!args["include-modified"];

const DAY_MS = 24*60*60*1000;

// Curated "core" blog URLs for faster crawl/indexing signals
// Keep this list small (15–25). Values must be absolute canonical URLs.
const CORE_BLOG_URLS = new Set([
  `${SITE}/blog/`,
  `${SITE}/blog/toc.html`,

  // BMS / CRM positioning
  `${SITE}/blog/nov2025/nov202025/what-is-a-business-momentum-system-and-why-now.html`,
  `${SITE}/blog/oct2025/oct152025/what-is-a-business-momentum-system-bms.html`,
  `${SITE}/blog/dec2025/dec032025/why-momentum-beats-management.html`,
  `${SITE}/blog/nov2025/nov302025/why-crms-slow-organizations-down.html`,
  `${SITE}/blog/jul2025/jul092025/why-your-crm-isnt-broken-its-doing-exactly-what-it-was-built-to-do.html`,
  `${SITE}/blog/dec2025/dec052025/todd-vs-salesforce.html`,
  `${SITE}/blog/dec2025/dec012025/todd-vs-hubspot.html`,
  `${SITE}/blog/nov2025/nov152025/todd-vs-microsoft-copilot.html`,

  // AI adoption / productivity
  `${SITE}/blog/dec2025/dec232025/why-ai-adoption-is-stalling.html`,
  `${SITE}/blog/dec2025/dec152025/why-most-business-tools-fail-to-improve-productivity.html`,

  // Data + outreach cost
  `${SITE}/blog/dec2025/dec202025/the-hidden-cost-of-disconnected-data.html`,
  `${SITE}/blog/aug2025/aug262025/the-real-cost-of-manual-outreach-in-2025.html`,
  `${SITE}/blog/apr2025/apr022025/the-real-cost-of-not-following-up.html`,
  `${SITE}/blog/aug2025/aug012025/stop-missing-follow-ups-why-outreach-relationship-management-beats-crm.html`,
  `${SITE}/blog/sep2025/sep012025/why-a-business-momentum-system-bms-beats-crms-in-2025.html`
]);

function priorityForCoreUrl(loc){
  if (loc === `${SITE}/blog/`) return "1.00";
  if (loc === `${SITE}/blog/toc.html`) return "0.95";
  return "0.90";
}

function buildUrlsetXml(urls){
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>${xmlEsc(u.loc)}</loc><lastmod>${xmlEsc(u.lastmod)}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}\n</urlset>`;
}

// days window for blog sitemap filtering
const SITEMAP_DAYS = args["sitemap-days"] !== undefined ? Number(args["sitemap-days"]) : 365;
const SITEMAP_DAYS_MS = Number.isFinite(SITEMAP_DAYS) && SITEMAP_DAYS > 0 ? SITEMAP_DAYS * DAY_MS : null; // null disables filtering

// top-level directory names we will NEVER treat as sections:
const RESERVED = new Set([
  "css", "js", "img", "assets", "fonts",
  "404.html", "410.html", "robots.txt", "sitemap.xml", "sitemap.generated.xml",
  "rss.xml", "atom.xml", "index.html", "thank-you.html"
]);

// if user passes --section multiple times, limit to those:
const EXPLICIT_SECTIONS = []
if (Array.isArray(args.section)) EXPLICIT_SECTIONS.push(...args.section);
else if (typeof args.section === "string") EXPLICIT_SECTIONS.push(args.section);


function isHtml(p){ return [".html", ".htm"].includes(path.extname(p).toLowerCase()); }
function relFromRoot(abs){ return path.relative(ROOT, abs).split(path.sep).join("/"); }
function relFromRootNormalized(abs){
  const raw = relFromRoot(abs); // e.g. "blog/index.html" or "blog/sep2023/post.html"

  // If this is an index.html inside a folder, prefer the folder URL with trailing slash.
  if (raw.toLowerCase().endsWith("/index.html")) {
    const dir = raw.slice(0, -"/index.html".length); // "blog" or "blog/sep2023"
    // For a section folder like "blog", return "/blog/"
    // For root-level (shouldn't happen here because we skip root index), return "/"
    return dir ? `/${dir}/` : "/";
  }

  // Default: normal file, just prefix with "/"
  return "/" + raw; // e.g. "/blog/sep2023/post.html"
}
function xmlEsc(s){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;"); }

async function* walk(dir){
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries){
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function listTopLevelDirs(){
  const out = [];
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  for (const e of entries){
    if (!e.isDirectory()) continue;
    if (RESERVED.has(e.name)) continue;
    out.push(e.name);
  }
  return out.sort();
}

function nowISO(){ return new Date().toISOString(); }

function canonicalUrlFor(rel){
  // if rel is already absolute (rare), pass through:
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${SITE}${rel.startsWith("/") ? "" : "/"}${rel}`;
}

async function collectSectionPages(sectionDir){
  const absDir = path.join(ROOT, sectionDir);
  const pages = [];
  try {
        for await (const f of walk(absDir)){
      if (!isHtml(f)) continue;
      const rel = relFromRootNormalized(f);
      const stat = await fs.stat(f);

      // Blog: prefer semantic lastmod from Article/BlogPosting JSON-LD
      let lastmod = stat.mtime.toISOString();
      if (/^blog$/i.test(sectionDir)) {
        const html = await fs.readFile(f, "utf8").catch(()=>null);
        if (html) {
          const iso = extractArticleLastmodISO(html);
          if (iso) lastmod = iso;
        }
      }

      pages.push({
        rel,
        abs: f,
        lastmod
      });
    }
  } catch {}
  return pages.sort((a,b)=> a.rel.localeCompare(b.rel, undefined, {sensitivity:"base"}));
}

async function collectRootPages(){
  // static HTML files in ROOT (not inside subfolders)
  const pages = [];
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  for (const e of entries){
    if (e.isDirectory()) continue;
    if (!isHtml(e.name)) continue;
    if (RESERVED.has(e.name)) continue;
    const abs = path.join(ROOT, e.name);
    const stat = await fs.stat(abs);
    pages.push({ rel: "/" + e.name, abs, lastmod: stat.mtime.toISOString() });
  }
  return pages;
}

// ----------------------- BLOG SPECIALS (TOC + RSS) -----------------------
function extractTitle(html){
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g," ").trim() : null;
}
function extractCanonical(html){
  const m = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i);
  if(!m) return null;
  const href = m[0].match(/\s+href=["']([^"']+)["']/i);
  return href ? href[1].trim() : null;
}
function parseJSONLDs(html){
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; while((m = re.exec(html))){
    try { blocks.push(JSON.parse(m[1])); } catch {}
  }
  return blocks;
}
function flatten(obj){
  const arr=[]; if(Array.isArray(obj)){ for(const x of obj) arr.push(...flatten(x)); }
  else if(obj && typeof obj==="object"){
    arr.push(obj);
    if(obj["@graph"]) arr.push(...flatten(obj["@graph"]));
    if(obj.itemListElement) arr.push(...flatten(obj.itemListElement));
    if(obj.mainEntity) arr.push(...flatten(obj.mainEntity));
  }
  return arr;
}
function findArticleNode(blocks){
  const isArticleType = (t)=> (Array.isArray(t)?t:[t]).map(x=>String(x).toLowerCase()).some(v=>v==="article"||v==="blogposting");
  for(const b of blocks){ for(const n of flatten(b)){ if(n && isArticleType(n["@type"])) return n; } }
  return null;
}
function extractArticleLastmodISO(html){
  try {
    const blocks = parseJSONLDs(html);
    const art = findArticleNode(blocks);
    const dm = art?.dateModified;
    const dp = art?.datePublished;
    const pick = dm || dp;
    if (!pick) return null;

    // Normalize YYYY-MM-DD to ISO midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(pick)) return pick + "T00:00:00.000Z";

    const t = Date.parse(pick);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  } catch {
    return null;
  }
}

async function buildBlogTocAndRss(sectionDir){
  const sectionAbs = path.join(ROOT, sectionDir);
  const rows = [];
  for await (const fileAbs of walk(sectionAbs)){
    if (!isHtml(fileAbs)) continue;
        const rel = relFromRootNormalized(fileAbs);
    const html = await fs.readFile(fileAbs, "utf8").catch(()=>null);
    if (!html) continue;

    const title = extractTitle(html) || path.basename(fileAbs);
    const canonical = extractCanonical(html);
    const url = canonical || rel;
    const blocks = parseJSONLDs(html);
    const art = findArticleNode(blocks);

    // dates
    let datePublished = art?.datePublished;
    if (datePublished && /^\d{4}-\d{2}-\d{2}T/.test(datePublished)) datePublished = datePublished.slice(0,10);
    const stat = await fs.stat(fileAbs).catch(()=>null);
    const dateModifiedISO = art?.dateModified || stat?.mtime?.toISOString();

    rows.push({
      title,
      url,
      author: (typeof art?.author === "string") ? art.author : (art?.author?.name || "Tyrone Showers"),
      datePublished,
      dateModifiedISO,
      rel
    });
  }

  // sort newest by published, fallback modified
  rows.sort((a,b)=>{
    const ap = Date.parse(a.datePublished || a.dateModifiedISO || 0);
    const bp = Date.parse(b.datePublished || b.dateModifiedISO || 0);
    return bp - ap;
  });

  // JSON-LD ItemList (TOC)
  const tocPageUrl = `${SITE}/${sectionDir}/toc.html`;
  const itemList = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${tocPageUrl}#page`,
        "name": "Taliferro Blog Table of Contents",
        "url": tocPageUrl,
        "isPartOf": { "@id": `${SITE}#website` },
        "mainEntity": { "@id": `${tocPageUrl}#all-articles` }
      },
      {
        "@type": "ItemList",
        "@id": `${tocPageUrl}#all-articles`,
        "name": "All Articles",
        "itemListOrder": "https://schema.org/ItemListOrderDescending",
        "numberOfItems": rows.length,
        "itemListElement": rows.map((p, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": {
            "@type": "Article",
            "headline": p.title,
            "url": canonicalUrlFor(p.url),
            "author": { "@type": "Person", "name": p.author || "Tyrone Showers" },
            ...(p.datePublished ? { "datePublished": p.datePublished } : {}),
            ...(p.dateModifiedISO ? { "dateModified": p.dateModifiedISO } : {}),
            "inLanguage": "en-US"
          }
        }))
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}#website`,
        "name": "Taliferro",
        "url": SITE + "/"
      }
    ]
  };

  const tocJson = `<script type="application/ld+json">\n${JSON.stringify(itemList,null,2)}\n</script>\n`;
  await fs.writeFile(path.join(sectionAbs, "toc.itemlist.jsonld"), tocJson, "utf8");

  // Minimal paste-ready TOC HTML body (uses INCLUDE_MODIFIED flag)
  const htmlRows = rows.map(p => `
      <div class="row py-2 align-items-center border-bottom g-3">
        ${INCLUDE_MODIFIED
          ? `<div class="col-12 col-md-2">${(p.datePublished||"—")}</div>
             <div class="col-12 col-md-2"><time datetime="${p.dateModifiedISO||""}">${(p.dateModifiedISO||"").slice(0,10)}</time></div>
             <div class="col-12 col-md-8 toc-article"><a href="${p.url}" target="_blank">${p.title}</a></div>`
          : `<div class="col-12 col-md-3">${(p.datePublished||"—")}</div>
             <div class="col-12 col-md-9 toc-article"><a href="${p.url}" target="_blank">${p.title}</a></div>`}
      </div>`).join("\n");

  const mainInner =
`<!-- BLOG TOC MAIN -->
<section class="section section-masthead pt-large pb-medium text-center">
  <div class="section-masthead__inner container-fluid">
    <header class="row section-masthead__header justify-content-center">
      <div class="col-lg-8">
        <h1 class="mt-0 mb-0 h1">Taliferro Blog — Table of Contents</h1>
      </div>
    </header>
  </div>
</section>
<div class="container">
  <div class="row fw-bold border-bottom py-2 align-items-center g-3">
    ${INCLUDE_MODIFIED
      ? '<div class="col-12 col-md-2"><strong>Published</strong></div><div class="col-12 col-md-2"><strong>Modified</strong></div><div class="col-12 col-md-8"><strong>Article</strong></div>'
      : '<div class="col-12 col-md-3"><strong>Published</strong></div><div class="col-12 col-md-9"><strong>Article</strong></div>'}
  </div>
${htmlRows}
</div>`;
  await fs.writeFile(path.join(sectionAbs, "toc.main.html"), mainInner, "utf8");

  // RSS (and optional Atom)
  const itemsXml = rows.map(p=>{
    const abs = canonicalUrlFor(p.url);
    const pub = p.datePublished || p.dateModifiedISO || nowISO();
    return `  <item>
    <title>${escapeXml(p.title)}</title>
    <link>${xmlEsc(abs)}</link>
    <guid isPermaLink="false">${xmlEsc(abs)}</guid>
    <pubDate>${new Date(pub).toUTCString()}</pubDate>
    <description>${xmlEsc("")}</description>
  </item>`;
  }).join("\n");

  const rss =
`<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Taliferro - Blog</title>
        <link>${xmlEsc(`${SITE}/${sectionDir}/`)}</link>
    <description>Latest articles and announcements from Taliferro.</description>
    <language>en-us</language>
${itemsXml}
  </channel>
</rss>
`;
  await fs.writeFile(path.join(sectionAbs, OVERWRITE ? "rss.xml" : "rss.generated.xml"), rss, "utf8");

  if (EMIT_ATOM){
    const entries = rows.map(p=>{
      const abs = canonicalUrlFor(p.url);
      const updated = p.dateModifiedISO || p.datePublished || nowISO();
      return `  <entry>
    <id>tag:${SITE.replace(/^https?:\/\//,'' )},${(p.datePublished||'0000-00-00')}:${abs.replace(/^https?:\/\//,'')}</id>
    <title>${escapeXml(p.title)}</title>
    <link href="${xmlEsc(abs)}"/>
    <updated>${new Date(updated).toISOString()}</updated>
  </entry>`;
    }).join("\n");
    const atom =
`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Taliferro - Blog</title>
  <link href="${xmlEsc(`${SITE}/${sectionDir}/`)}"/>
${entries}
</feed>`;
    await fs.writeFile(path.join(sectionAbs, OVERWRITE ? "atom.xml" : "atom.generated.xml"), atom, "utf8");
  }

  function escapeXml(s){ return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
}

// ----------------------- MAIN -----------------------
(async ()=>{
  // 1) discover sections
  const auto = await listTopLevelDirs();
  const sections = EXPLICIT_SECTIONS.length ? auto.filter(d=>EXPLICIT_SECTIONS.includes(d)) : auto;

  // 2) collect static root pages (e.g., /about.html, /case-studies.html, etc.)
  const rootPages = await collectRootPages();

  // 3) per-section sitemaps
  const sectionMapEntries = []; // for sitemap index
  const sitemapIndexParts = [];

  // add homepage and some fixed top-level URLs
  const topUrls = [
    { loc: `${SITE}/`, lastmod: nowISO(), priority: "1.00" }
  ];
  for (const p of rootPages){
    topUrls.push({ loc: canonicalUrlFor(p.rel), lastmod: p.lastmod, priority: "0.80" });
  }

  // write a small “root urls” sitemap fragment into memory
  const rootSitemapXml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${topUrls.map(u=>`  <url><loc>${xmlEsc(u.loc)}</loc><lastmod>${xmlEsc(u.lastmod)}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;
  const outRootSitemapName = OVERWRITE ? "sitemap.root.xml" : "sitemap.root.generated.xml";
  await fs.writeFile(path.join(ROOT, outRootSitemapName), rootSitemapXml, "utf8");
  sectionMapEntries.push({ loc: `${SITE}/${outRootSitemapName}`, lastmod: nowISO() });

  // Per-section loop
  for (const sec of sections){
    // Collect all pages for this section
    let pages = await collectSectionPages(sec);

    // For blog: keep an unfiltered copy so core sitemap is never accidentally emptied by --sitemap-days
    const isBlog = /^blog$/i.test(sec);
    const allBlogPages = isBlog ? pages.slice() : null;

    // If this is the blog section, optionally filter to the last N days (based on file mtime/lastmod)
    if (isBlog && SITEMAP_DAYS_MS) {
      const cutoff = Date.now() - SITEMAP_DAYS_MS;
      const beforeCount = pages.length;
      pages = pages.filter(p => {
        const lm = Date.parse(p.lastmod);
        return Number.isFinite(lm) && lm >= cutoff;
      });
      // If everything was filtered out, keep at least the most recent 1 to avoid empty sitemap edge-cases
      if (pages.length === 0 && beforeCount > 0) {
        // retain the single most recently modified page to avoid producing an entirely empty blog sitemap
        pages = (await collectSectionPages(sec)).sort((a,b) => Date.parse(b.lastmod) - Date.parse(a.lastmod)).slice(0,1);
      }
    }

    if (!pages.length) continue;

    // blog special handling
    if (isBlog){
      await buildBlogTocAndRss(sec);
    }

    // Blog core sitemap: curated shortlist for stronger crawl/indexing signals
    if (isBlog) {
      const source = allBlogPages || [];
      const coreUrls = source
        .map(p => ({
          loc: canonicalUrlFor(p.rel),
          lastmod: p.lastmod,
          priority: priorityForCoreUrl(canonicalUrlFor(p.rel))
        }))
        .filter(u => CORE_BLOG_URLS.has(u.loc));

      // Ensure the core always includes /blog/ and /blog/toc.html if present
      // (they should already be in the list, but this guards against edge-cases)
      const hasBlogHome = coreUrls.some(u => u.loc === `${SITE}/blog/`);
      const hasToc = coreUrls.some(u => u.loc === `${SITE}/blog/toc.html`);

      if (!hasBlogHome) {
        const p = source.find(x => canonicalUrlFor(x.rel) === `${SITE}/blog/`);
        if (p) coreUrls.unshift({ loc: `${SITE}/blog/`, lastmod: p.lastmod, priority: "1.00" });
      }
      if (!hasToc) {
        const p = source.find(x => canonicalUrlFor(x.rel) === `${SITE}/blog/toc.html`);
        if (p) coreUrls.push({ loc: `${SITE}/blog/toc.html`, lastmod: p.lastmod, priority: "0.95" });
      }

      if (coreUrls.length) {
        // Sort newest first by lastmod (keeps the top of the file fresh)
        coreUrls.sort((a,b)=> Date.parse(b.lastmod) - Date.parse(a.lastmod));

        const coreXml = buildUrlsetXml(coreUrls);
        const coreFileName = OVERWRITE ? `sitemap.${sec}-core.xml` : `sitemap.${sec}-core.generated.xml`;
        await fs.writeFile(path.join(ROOT, coreFileName), coreXml, "utf8");
        sectionMapEntries.push({ loc: `${SITE}/${coreFileName}`, lastmod: nowISO() });
      }
    }

    const urls = pages.map(p => ({
      loc: canonicalUrlFor(p.rel),
      lastmod: p.lastmod,
      priority: "0.80"
    }));

    const xml = buildUrlsetXml(urls);
    const fileName = OVERWRITE ? `sitemap.${sec}.xml` : `sitemap.${sec}.generated.xml`;
    await fs.writeFile(path.join(ROOT, fileName), xml, "utf8");
    sectionMapEntries.push({ loc: `${SITE}/${fileName}`, lastmod: nowISO() });
  }

  // 4) sitemap index
  const sitemapIndex =
`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sectionMapEntries.map(e=>`  <sitemap><loc>${xmlEsc(e.loc)}</loc><lastmod>${xmlEsc(e.lastmod)}</lastmod></sitemap>`).join("\n")}
</sitemapindex>`;
  const indexName = OVERWRITE ? "sitemap.xml" : "sitemap.generated.xml";
  await fs.writeFile(path.join(ROOT, indexName), sitemapIndex, "utf8");

  console.log(`Built:
  - ${indexName} (index of ${sectionMapEntries.length} sitemaps)
  - Per-section sitemaps for: ${sections.join(", ")}
  - Root URLs sitemap: ${outRootSitemapName}
  - Blog extras: rss/toc (if blog/ exists)`);
})();