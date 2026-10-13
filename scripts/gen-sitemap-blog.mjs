/**
 * Generates sitemap.blog.xml from all blog HTML files.
 * Run from the project root: node root/scripts/gen-sitemap-blog.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const blogDir = path.join(publicDir, 'blog');
const outFile = path.join(publicDir, 'sitemap.blog.xml');

const BASE_URL = 'https://taliferro.com';

const EXCLUDE_PATTERNS = [
  /toc\.html$/,
  /toc\.main\.html$/,
  /thank-you\.html$/,
  /404\.html$/,
  /410\.html$/,
];

function shouldExclude(filePath) {
  if (EXCLUDE_PATTERNS.some(p => p.test(filePath))) return true;
  // Skip pages with noindex directive — no point submitting them to Google
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (/content="noindex/.test(content)) return true;
  } catch { /* skip unreadable */ }
  return false;
}

function fileToUrl(filePath) {
  const rel = path.relative(publicDir, filePath).replace(/\\/g, '/');
  // index.html → trailing slash URL
  if (path.basename(filePath) === 'index.html') {
    return `${BASE_URL}/${rel.replace(/index\.html$/, '')}`;
  }
  return `${BASE_URL}/${rel}`;
}

function walkDir(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else if (entry.name.endsWith('.html') && !shouldExclude(full)) {
      results.push(full);
    }
  }
  return results;
}

function formatDate(mtime) {
  return mtime.toISOString().split('T')[0];
}

function priorityFor(filePath) {
  // Higher priority for blog index and category pages
  if (filePath === path.join(blogDir, 'index.html')) return '0.90';
  if (path.basename(filePath) === 'index.html') return '0.80';
  return '0.70';
}

const files = walkDir(blogDir);
files.sort();

const entries = files.map(f => {
  const stat = fs.statSync(f);
  const url = fileToUrl(f);
  const lastmod = formatDate(stat.mtime);
  const priority = priorityFor(f);
  return `  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

fs.writeFileSync(outFile, xml, 'utf8');
console.log(`✓ Wrote ${entries.length} URLs to ${outFile}`);
