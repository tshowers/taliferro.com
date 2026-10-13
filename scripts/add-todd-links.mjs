#!/usr/bin/env node
/**
 * add-todd-links.mjs
 *
 * Appends a compact "explore TODD's tools + affiliate program" link line
 * to the bottom of the primary CTA card (the one with the
 * .btnrow[style*="margin-top:10px"] button row) on every dated blog post.
 *
 * Usage:
 *   node root/scripts/add-todd-links.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('../public/blog', import.meta.url).pathname;
const DRY_RUN = process.argv.includes('--dry-run');

const LINKS_LINE = `<p class="fine" style="margin-top:10px;">Explore Taliferro&#39;s free tools: <a href="https://ask.taliferro.tech">Ask TODD</a> &middot; <a href="https://find.taliferro.tech">Find</a> &middot; <a href="https://signature.taliferro.tech">Email Signature Builder</a> &middot; <a href="https://sayit.taliferro.tech">SayIt</a> &middot; <a href="https://lead-vault.taliferro.tech">Lead Vault</a> &middot; <a href="https://maya.taliferro.tech">Meet Maya</a> &mdash; or <a href="https://taliferro.com/todd-affiliate-program/">become an affiliate</a>.</p>`;

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

const CTA_BTNROW = /<div class="btnrow" style="margin-top:10px;">[\s\S]*?<\/div>/;

let updated = 0;
let skipped = 0;

for (const filePath of walk(ROOT)) {
  const html = readFileSync(filePath, 'utf8');
  const rel = filePath.replace(ROOT + '/', '');

  if (html.includes('data-todd-links="true"')) {
    skipped += 1;
    continue;
  }

  const m = CTA_BTNROW.exec(html);
  if (!m) {
    console.log('SKIP (no CTA btnrow found):', rel);
    skipped += 1;
    continue;
  }

  const insertAt = m.index + m[0].length;
  const insertion = `\n        ${LINKS_LINE.replace('<p class="fine"', '<p class="fine" data-todd-links="true"')}`;
  const updatedHtml = html.slice(0, insertAt) + insertion + html.slice(insertAt);

  if (!DRY_RUN) {
    writeFileSync(filePath, updatedHtml, 'utf8');
  }
  updated += 1;
}

console.log(`\n--- Summary ---`);
console.log(`Updated: ${updated}  |  Skipped: ${skipped}`);
if (DRY_RUN) console.log('(dry-run — no files modified)');
