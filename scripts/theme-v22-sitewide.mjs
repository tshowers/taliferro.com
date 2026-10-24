#!/usr/bin/env node
/**
 * theme-v22-sitewide.mjs
 *
 * Site-wide part of the "Spiral" (v22) theme rollout. For every .html page
 * under public/:
 *   - swaps taliferro-styles-v21.css for /css/taliferro-styles-v22.css?v=<hash>
 *     (relative and absolute links). Re-run after editing the stylesheet so
 *     the ?v= hash changes and browsers drop their day-old cached copy.
 *   - sets the theme-color metas to the v22 ground colors
 *   - replaces the <header class="topbar"> block with the one site header
 *     (Rescue / Services / Results / Blog / About + "Get same-day help").
 *     Print buttons on printable documents are kept.
 *
 * Safe to re-run: every step matches its own output.
 *
 * Usage:
 *   node root/scripts/theme-v22-sitewide.mjs [--dry-run] [--file public/about.html]
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, relative } from 'path';

const ROOT = new URL('../public', import.meta.url).pathname;
const DRY_RUN = process.argv.includes('--dry-run');
const fileArg = process.argv.indexOf('--file');
const ONLY = fileArg > -1 ? process.argv[fileArg + 1] : null;

// Versioned by content hash: CSS is cached for a day, so every change gets a new URL.
const CSS_FILE = join(ROOT, 'css/taliferro-styles-v22.css');
const CSS_VERSION = createHash('sha1').update(readFileSync(CSS_FILE)).digest('hex').slice(0, 8);
const CSS_HREF = `/css/taliferro-styles-v22.css?v=${CSS_VERSION}`;
const SKIP = new Set(['blog/toc.main.html']); // fragment, not a page

const NAV = [
  ['Rescue', '/rescue-me/', (p) => p.startsWith('rescue-me/')],
  ['Services', '/services/', (p) => /^(services|agile-coaching|api-design-services|api-certification|cloud-architecture-consulting|ecommerce-development|machine-learning-services|website-development|fractional-cto|it-consultant-seattle|small-business-it-consultant)\//.test(p) || p === 'benefits-of-partnering-with-taliferro.html'],
  ['Results', '/case-studies.html', (p) => p === 'case-studies.html' || /^support-material\/.*case-study/.test(p)],
  ['Blog', '/blog/', (p) => p.startsWith('blog/')],
  ['About', '/about.html', (p) => p === 'about.html' || p.startsWith('team/') || p.startsWith('careers/')],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function buildHeader(relPath, printButton) {
  const links = NAV.map(([label, href, isCurrent]) =>
    `        <a href="${href}"${isCurrent(relPath) ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('\n');
  const print = printButton ? `\n        ${printButton}` : '';
  return `<header class="topbar no-print">
    <div class="page-shell topbar-inner">
      <a class="brand" href="/" aria-label="Taliferro home">
        <img class="brandLogo" src="https://taliferro.com/img/general/taliferro-logo.svg" alt="Taliferro logo" width="36" height="36" onerror="this.style.display='none'" />
        <span>Taliferro</span>
      </a>
      <nav class="nav-links" aria-label="Site navigation">
${links}
        <button class="theme-toggle" type="button" aria-label="Toggle dark mode" aria-pressed="false">Dark</button>${print}
        <a class="button button-primary" href="/#triage">Get same-day help</a>
      </nav>
    </div>
  </header>`;
}

const stats = { files: 0, css: 0, themeColor: 0, header: 0, noHeader: [] };

const files = ONLY ? [join(ROOT, '..', ONLY)] : walk(ROOT);
for (const file of files) {
  const rel = relative(ROOT, file);
  if (SKIP.has(rel)) continue;
  let html = readFileSync(file, 'utf8');
  const before = html;

  html = html.replace(/href="(?:https:\/\/taliferro\.com\/|\.{0,2}\/?)css\/taliferro-styles-v2[12]\.css(?:\?v=[0-9a-f]+)?"/g, (m) => {
    if (m === `href="${CSS_HREF}"`) return m;
    stats.css++;
    return `href="${CSS_HREF}"`;
  });

  html = html.replace(/<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="[^"]*"\s*\/?>/g,
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#eef5f8" />');
  html = html.replace(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="[^"]*"\s*\/?>/g,
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#07121f" />');
  if (html.includes('content="#eef5f8"')) stats.themeColor++;

  const headerRe = /<header class="topbar[^"]*">[\s\S]*?<\/nav>\s*<\/div>\s*<\/header>/;
  const m = html.match(headerRe);
  if (m) {
    const printMatch = m[0].match(/<button[^>]*onclick="window\.print\(\)"[^>]*>[^<]*<\/button>/);
    const printButton = printMatch ? printMatch[0].replace(/class="[^"]*"/, 'class="print-button"') : null;
    html = html.replace(headerRe, buildHeader(rel, printButton));
    stats.header++;
  } else {
    stats.noHeader.push(rel);
  }

  if (html !== before) {
    stats.files++;
    if (!DRY_RUN) writeFileSync(file, html);
  }
}

console.log(`${DRY_RUN ? '[dry run] ' : ''}changed ${stats.files} files`);
console.log(`  stylesheet links: ${stats.css}`);
console.log(`  pages with v22 theme-color: ${stats.themeColor}`);
console.log(`  headers replaced: ${stats.header}`);
if (stats.noHeader.length) console.log(`  no topbar found (left alone):\n    ${stats.noHeader.join('\n    ')}`);
