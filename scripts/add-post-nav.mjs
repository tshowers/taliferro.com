#!/usr/bin/env node
/**
 * add-post-nav.mjs
 *
 * Inserts chronological Previous/Next post navigation into every dated
 * blog post, right before the closing </section> of the article. Order
 * is derived from the mon-DD-YYYY folder naming convention (e.g. dec012022).
 *
 * Usage:
 *   node root/scripts/add-post-nav.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('../public/blog', import.meta.url).pathname;
const BASE_URL = 'https://taliferro.com/blog';
const DRY_RUN = process.argv.includes('--dry-run');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function walk(dir, depth = 0, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1, results);
    } else if (depth === 2 && entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

function parseDate(filePath) {
  const rel = filePath.replace(ROOT + '/', '');
  const [monthFolder, dayFolder] = rel.split('/');
  const m = dayFolder.match(/^([a-z]{3})(\d{1,2})(\d{4})$/);
  if (!m) return null;
  const [, mon, day, year] = m;
  const monthIdx = MONTHS.indexOf(mon);
  if (monthIdx === -1) return null;
  return { year: Number(year), month: monthIdx, day: Number(day) };
}

const files = walk(ROOT);
const posts = [];

for (const filePath of files) {
  const date = parseDate(filePath);
  if (!date) {
    console.log('SKIP (unparseable date):', filePath.replace(ROOT + '/', ''));
    continue;
  }
  const html = readFileSync(filePath, 'utf8');
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  if (!titleMatch) {
    console.log('SKIP (no h1):', filePath.replace(ROOT + '/', ''));
    continue;
  }
  const rel = filePath.replace(ROOT + '/', '');
  posts.push({
    filePath,
    rel,
    url: `${BASE_URL}/${rel}`,
    title: titleMatch[1].trim(),
    sortKey: [date.year, date.month, date.day, rel],
  });
}

posts.sort((a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a.sortKey[i] !== b.sortKey[i]) return a.sortKey[i] - b.sortKey[i];
  }
  return a.sortKey[3] < b.sortKey[3] ? -1 : 1;
});

console.log(`Parsed ${posts.length} posts. Range: ${posts[0].rel} .. ${posts[posts.length - 1].rel}`);

// Finds the offset of the </div> that closes the <div class="page-shell">
// belonging to the Article section. Anchored on the div-close immediately
// followed by </section> and then the page-level trailing .bottom-pad —
// a sequence confirmed unique (exactly once) across every post. Depth-
// tracking from the page-shell's opening tag was tried first but several
// dozen posts have a pre-existing unrelated unclosed <div> earlier in the
// article body, which throws off a naive depth count.
function findPageShellCloseOffset(html) {
  const m = /<\/div>(\s*<\/section>\s*<div class="bottom-pad")/.exec(html);
  return m ? m.index : -1;
}

let updated = 0;
let skipped = 0;

posts.forEach((post, i) => {
  const prev = i > 0 ? posts[i - 1] : null;
  const next = i < posts.length - 1 ? posts[i + 1] : null;

  const html = readFileSync(post.filePath, 'utf8');

  if (html.includes('class="post-nav"')) {
    skipped += 1;
    return;
  }

  const closeOffset = findPageShellCloseOffset(html);
  if (closeOffset === -1) {
    console.log('SKIP (no page-shell close found):', post.rel);
    skipped += 1;
    return;
  }

  // Titles are lifted verbatim from existing <h1> markup, which is
  // already valid HTML (entities and all) — do not re-escape them.
  const links = [];
  if (prev) {
    links.push(`<a class="button" href="${prev.url}">&larr; ${prev.title}</a>`);
  }
  if (next) {
    links.push(`<a class="button" href="${next.url}">${next.title} &rarr;</a>`);
  }
  if (links.length === 0) return;

  const block = `      <div class="divider"></div>
      <div class="card">
        <p class="quote">More from the blog</p>
        <nav class="post-nav btnrow" style="margin-top:10px;" aria-label="Post navigation">
          ${links.join('\n          ')}
        </nav>
      </div>
`;

  const updatedHtml = html.slice(0, closeOffset) + block + html.slice(closeOffset);

  if (!DRY_RUN) {
    writeFileSync(post.filePath, updatedHtml, 'utf8');
  }
  updated += 1;
});

console.log(`\n--- Summary ---`);
console.log(`Updated: ${updated}  |  Skipped: ${skipped}`);
if (DRY_RUN) console.log('(dry-run — no files modified)');
