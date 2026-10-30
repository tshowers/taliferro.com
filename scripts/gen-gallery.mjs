#!/usr/bin/env node
/**
 * gen-gallery.mjs
 *
 * Rebuilds the poster wall in gallery/index.html from
 * public/img/gallery/posters.json. One record per poster, in display order:
 *   { "img": "taliferro-1.webp", "category": "Product", "headline": "...",
 *     "subline": "...", "ctaLabel": "See Response Flow", "href": "https://..." }
 *
 * Writes two marked blocks:
 *   <!-- GALLERY-FILTERS:START/END -->  filter chips, one per category (in first-seen order)
 *   <!-- GALLERY:START/END -->          poster cards
 * Alt text is headline + subline (the copy baked into the image is invisible to
 * search engines). "Product" posters get the blue pill; everything else cyan.
 * Images in img/gallery/ without a record are reported and left off the wall.
 *
 * Usage:
 *   node root/scripts/gen-gallery.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const IMG_DIR = new URL('../public/img/gallery', import.meta.url).pathname;
const GALLERY_FILE = new URL('../public/gallery/index.html', import.meta.url).pathname;
const POSTERS_FILE = join(IMG_DIR, 'posters.json');
const DRY_RUN = process.argv.includes('--dry-run');

const IMAGE_EXT = /\.(webp|jpg|jpeg|png)$/i;
const REQUIRED = ['img', 'category', 'headline', 'subline', 'ctaLabel', 'href'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const posters = JSON.parse(readFileSync(POSTERS_FILE, 'utf8'));
const files = new Set(readdirSync(IMG_DIR).filter(name => IMAGE_EXT.test(name)));

for (const [i, p] of posters.entries()) {
  const missing = REQUIRED.filter(k => !p[k]);
  if (missing.length) {
    console.error(`posters.json record ${i} is missing: ${missing.join(', ')} — aborting.`);
    process.exit(1);
  }
  if (!files.has(p.img)) {
    console.error(`posters.json record ${i}: ${p.img} not found in ${IMG_DIR} — aborting.`);
    process.exit(1);
  }
  files.delete(p.img);
}
if (files.size) console.warn(`No posters.json record (not shown): ${[...files].join(', ')}`);

const categories = [...new Set(posters.map(p => p.category))];

const chips = ['All', ...categories].map((c, i) =>
  `          <button class="chip chip--sm" type="button" data-filter="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`
).join('\n');

const cards = posters.map((p, i) => {
  const id = p.img.replace(IMAGE_EXT, '');
  const alt = `${p.headline} ${p.subline}`;
  const external = /^https?:\/\//.test(p.href) && !p.href.startsWith('https://taliferro.com');
  const target = external ? ' target="_blank" rel="noopener"' : '';
  const loading = i < 3 ? 'eager' : 'lazy';
  return `        <article class="poster-card" data-cat="${esc(p.category)}" data-poster="${esc(id)}">
          <button class="poster-card__open" type="button" aria-label="Open poster: ${esc(p.headline)}">
            <img src="/img/gallery/${esc(p.img)}" alt="${esc(alt)}" loading="${loading}" />
          </button>
          <div class="poster-card__body">
            <span class="tag tag--sm${p.category === 'Product' ? ' tag--product' : ''}">${esc(p.category)}</span>
            <h2 class="poster-card__title">${esc(p.headline)}</h2>
            <p>${esc(p.subline)}</p>
            <a class="poster-card__cta" href="${esc(p.href)}"${target}>${esc(p.ctaLabel)} →</a>
          </div>
        </article>`;
}).join('\n');

let html = readFileSync(GALLERY_FILE, 'utf8');
for (const [name, block, indent] of [['GALLERY-FILTERS', chips, '          '], ['GALLERY', cards, '        ']]) {
  const pattern = new RegExp(`<!-- ${name}:START -->[\\s\\S]*?<!-- ${name}:END -->`);
  if (!pattern.test(html)) {
    console.error(`${name} markers not found — aborting.`);
    process.exit(1);
  }
  html = html.replace(pattern, () => `<!-- ${name}:START -->\n${block}\n${indent}<!-- ${name}:END -->`);
}

if (!DRY_RUN) {
  writeFileSync(GALLERY_FILE, html, 'utf8');
  console.log(`Wrote ${posters.length} posters (${categories.length} categories) to ${GALLERY_FILE}`);
} else {
  console.log(`(dry-run) Would write ${posters.length} posters (${categories.length} categories)`);
}
