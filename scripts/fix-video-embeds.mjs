#!/usr/bin/env node
/**
 * fix-video-embeds.mjs
 *
 * Several posts embed YouTube Shorts using classes that were never
 * defined in the current stylesheet (.video-embed-vert, .float-md-right),
 * so they render as tiny unstyled default-size iframes instead of the
 * centered, rounded, cinematic vertical player the site already has a
 * real CSS rule for (.video-9x16, used correctly by ~11 other posts).
 *
 * This rewrites the broken wrapper to match the working pattern:
 *   <div class="float-md-right video-embed-vert" aria-label="...">
 *     <iframe ...></iframe>
 *   </div>
 * becomes:
 *   <figure class="blog-video-float-right">
 *     <div class="video-9x16"><iframe ...></iframe></div>
 *     <figcaption class="sr-only">...</figcaption>
 *   </figure>
 *
 * Usage:
 *   node root/scripts/fix-video-embeds.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('../public/blog', import.meta.url).pathname;
const DRY_RUN = process.argv.includes('--dry-run');

const PATTERN = /<div class="(?:float-md-right )?video-embed-vert" aria-label="([^"]*)"[^>]*>\s*(<iframe[\s\S]*?<\/iframe>)\s*<\/div>/g;

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

let updated = 0;

for (const filePath of walk(ROOT)) {
  const html = readFileSync(filePath, 'utf8');

  const updatedHtml = html.replace(PATTERN, (_match, label, iframe) => {
    return `<figure class="blog-video-float-right">
              <div class="video-9x16">${iframe}</div>
              <figcaption class="sr-only">${label}</figcaption>
            </figure>`;
  });

  if (updatedHtml === html) continue;

  if (!DRY_RUN) {
    writeFileSync(filePath, updatedHtml, 'utf8');
  }
  updated += 1;
}

console.log(`Updated: ${updated}`);
if (DRY_RUN) console.log('(dry-run — no files modified)');
