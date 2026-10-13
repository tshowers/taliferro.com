#!/usr/bin/env node
/**
 * gen-gallery.mjs
 *
 * Rebuilds the fullscreen scroll gallery in gallery/index.html (between the
 * <!-- GALLERY:START --> / <!-- GALLERY:END --> markers) from every image in
 * public/img/gallery/, sorted by filename. Alt text comes from an optional
 * public/img/gallery/captions.json ({"file.webp": "Alt text"}); any image
 * missing an entry falls back to a title-cased version of its filename.
 *
 * Usage:
 *   node root/scripts/gen-gallery.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const IMG_DIR = new URL('../public/img/gallery', import.meta.url).pathname;
const GALLERY_FILE = new URL('../public/gallery/index.html', import.meta.url).pathname;
const CAPTIONS_FILE = join(IMG_DIR, 'captions.json');
const DRY_RUN = process.argv.includes('--dry-run');

const IMAGE_EXT = /\.(webp|jpg|jpeg|png)$/i;

function titleCaseFromFilename(filename) {
  const slug = filename.replace(IMAGE_EXT, '');
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const captions = existsSync(CAPTIONS_FILE)
  ? JSON.parse(readFileSync(CAPTIONS_FILE, 'utf8'))
  : {};

const images = readdirSync(IMG_DIR, { withFileTypes: true })
  .filter(entry => entry.isFile() && IMAGE_EXT.test(entry.name))
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (images.length === 0) {
  console.error(`No images found in ${IMG_DIR} — aborting.`);
  process.exit(1);
}

console.log(`Found ${images.length} images.`);

const sections = images.map((file, idx) => {
  const alt = captions[file] || titleCaseFromFilename(file);
  const loading = idx === 0 ? 'eager' : 'lazy';
  const fetchpriority = idx === 0 ? ' fetchpriority="high"' : '';
  return `      <section class="gallery-scene">\n        <img src="/img/gallery/${file}" alt="${alt}" loading="${loading}"${fetchpriority} />\n      </section>`;
});

const newBlock = sections.join('\n');

const gallery = readFileSync(GALLERY_FILE, 'utf8');
const markerPattern = /<!-- GALLERY:START -->[\s\S]*?<!-- GALLERY:END -->/;

if (!markerPattern.test(gallery)) {
  console.error('GALLERY markers not found — aborting.');
  process.exit(1);
}

const updatedGallery = gallery.replace(
  markerPattern,
  `<!-- GALLERY:START -->\n${newBlock}\n      <!-- GALLERY:END -->`
);

if (!DRY_RUN) {
  writeFileSync(GALLERY_FILE, updatedGallery, 'utf8');
  console.log(`Wrote ${images.length} scenes to ${GALLERY_FILE}`);
} else {
  console.log(`(dry-run) Would write ${images.length} scenes`);
}
