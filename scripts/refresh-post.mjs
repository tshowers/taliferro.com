#!/usr/bin/env node
/**
 * refresh-post.mjs
 *
 * Upgrades blog posts to improve indexability:
 *   1. Upgrades robots meta to rich directives (max-snippet, image-preview, video-preview)
 *   2. Updates dateModified in Article JSON-LD to today
 *
 * Usage:
 *   node root/scripts/refresh-post.mjs <file> [<file2> ...]
 *   node root/scripts/refresh-post.mjs --dir blog/aug2024  (all .html in a folder tree)
 *   node root/scripts/refresh-post.mjs --dry-run <file>
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TODAY = new Date().toISOString().split('T')[0]; // e.g. 2026-06-06
const TODAY_ISO = `${TODAY}T09:00:00-07:00`;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dirIdx = args.indexOf('--dir');

let files = [];

if (dirIdx !== -1) {
  const dir = args[dirIdx + 1];
  files = findHtmlFiles(dir);
} else {
  files = args.filter(a => !a.startsWith('--'));
}

function findHtmlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...findHtmlFiles(full));
    else if (entry.endsWith('.html')) results.push(full);
  }
  return results;
}

function refreshFile(file) {
  let html = readFileSync(file, 'utf8');
  let changed = false;
  const log = [];

  // 1. Upgrade robots meta if it's basic (no max-snippet already present)
  if (/content="index, follow"/.test(html) && !/max-snippet/.test(html)) {
    html = html.replace(
      /(<meta name="robots" content=")index, follow(")/i,
      '$1index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1$2'
    );
    log.push('robots → rich directives');
    changed = true;
  }

  // 2. Update dateModified in Article JSON-LD
  const dateModPattern = /"dateModified"\s*:\s*"[^"]+"/;
  if (dateModPattern.test(html)) {
    const orig = html.match(dateModPattern)[0];
    const updated = `"dateModified": "${TODAY_ISO}"`;
    if (orig !== updated) {
      html = html.replace(dateModPattern, updated);
      log.push(`dateModified → ${TODAY_ISO}`);
      changed = true;
    }
  }

  if (changed) {
    if (!DRY_RUN) writeFileSync(file, html, 'utf8');
    console.log(`  ${DRY_RUN ? 'WOULD UPDATE' : 'UPDATED'} ${file}`);
    log.forEach(l => console.log(`    ✓ ${l}`));
  } else {
    console.log(`  SKIP (no changes needed): ${file}`);
  }
  return changed;
}

let updated = 0;
let skipped = 0;
for (const f of files) {
  if (refreshFile(f)) updated++;
  else skipped++;
}

console.log(`\n--- Summary ---`);
console.log(`Updated: ${updated}  |  Skipped: ${skipped}`);
if (DRY_RUN) console.log('(dry-run — no files modified)');
