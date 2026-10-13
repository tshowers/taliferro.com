#!/usr/bin/env node
/**
 * gen-toc.mjs
 *
 * Rebuilds the visible post list in blog/toc.html (between the
 * <!-- TOC:BEGIN --> / <!-- TOC:END --> markers) from every dated blog
 * post, grouped by year, newest first. The JSON-LD ItemList at the top
 * of the file is left untouched (it intentionally covers only the most
 * recent posts as curated highlights).
 *
 * Usage:
 *   node root/scripts/gen-toc.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BLOG_DIR = new URL('../public/blog', import.meta.url).pathname;
const TOC_FILE = join(BLOG_DIR, 'toc.html');
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
  const rel = filePath.replace(BLOG_DIR + '/', '');
  const [, dayFolder] = rel.split('/');
  const m = dayFolder.match(/^([a-z]{3})(\d{1,2})(\d{4})$/);
  if (!m) return null;
  const [, mon, day, year] = m;
  const monthIdx = MONTHS.indexOf(mon);
  if (monthIdx === -1) return null;
  return { year: Number(year), month: monthIdx, day: Number(day) };
}

const files = walk(BLOG_DIR);
const posts = [];

for (const filePath of files) {
  const date = parseDate(filePath);
  if (!date) continue;
  const html = readFileSync(filePath, 'utf8');
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  if (!titleMatch) continue;
  const rel = filePath.replace(BLOG_DIR + '/', '');
  const iso = `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  posts.push({
    url: `${BASE_URL}/${rel}`,
    title: titleMatch[1].trim(),
    iso,
    sortKey: [date.year, date.month, date.day],
  });
}

// newest first
posts.sort((a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a.sortKey[i] !== b.sortKey[i]) return b.sortKey[i] - a.sortKey[i];
  }
  return 0;
});

console.log(`Found ${posts.length} posts.`);

const byYear = new Map();
for (const post of posts) {
  const year = post.sortKey[0];
  if (!byYear.has(year)) byYear.set(year, []);
  byYear.get(year).push(post);
}

const years = [...byYear.keys()].sort((a, b) => b - a);

const sections = years.map((year, idx) => {
  const items = byYear.get(year)
    .map(p => `          <li><a href="${p.url}">${p.title}</a> <span class="date">${p.iso}</span></li>`)
    .join('\n');
  const divider = idx > 0 ? '        <div class="divider"></div>\n' : '';
  return `${divider}        <h3>${year}</h3>\n        <ul class="toc-list">\n${items}\n        </ul>`;
});

const newBlock = sections.join('\n');

const toc = readFileSync(TOC_FILE, 'utf8');
const markerPattern = /<!-- TOC:BEGIN -->[\s\S]*?<!-- TOC:END -->/;

if (!markerPattern.test(toc)) {
  console.error('TOC markers not found — aborting.');
  process.exit(1);
}

const updatedToc = toc.replace(markerPattern, `<!-- TOC:BEGIN -->\n${newBlock}\n        <!-- TOC:END -->`);

if (!DRY_RUN) {
  writeFileSync(TOC_FILE, updatedToc, 'utf8');
  console.log(`Wrote ${posts.length} posts across ${years.length} years to ${TOC_FILE}`);
} else {
  console.log(`(dry-run) Would write ${posts.length} posts across ${years.length} years`);
}
