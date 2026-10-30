#!/usr/bin/env python3
"""
inject-footer.py
Injects a standard site footer before </body> on every HTML page.
Skips pages that already have class="footer".
Skips rescue-me/index.html.

Usage:
  python3 inject-footer.py          # dry run
  python3 inject-footer.py --run    # apply
"""

import os, sys, re

PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))

SKIP = {os.path.normpath(os.path.join(PUBLIC_DIR, 'rescue-me', 'index.html'))}

FOOTER = """\
  <footer class="footer no-print">
    <div class="page-shell">
      <div class="footer-inner">
        <p class="footer-copy">Seattle &bull; Taliferro Tech, LLC &bull; &copy; 2026 Taliferro&reg; is registered in the U.S. Patent and Trademark Office. All rights reserved.</p>
        <nav class="footer-links" aria-label="Footer navigation">
          <a href="/about.html">About</a>
          <a href="/contact.html">Contact</a>
          <a href="/case-studies.html">Case Studies</a>
          <a href="/gallery/">Gallery</a>
          <a href="/sitemap.html">Sitemap</a>
        </nav>
      </div>
    </div>
  </footer>
"""

def collect():
    files = []
    for root, dirs, fnames in os.walk(PUBLIC_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in fnames:
            if f.endswith('.html'):
                files.append(os.path.normpath(os.path.join(root, f)))
    return sorted(files)

def main():
    dry_run = '--run' not in sys.argv
    changed = skipped = 0
    for path in collect():
        if path in SKIP:
            skipped += 1
            continue
        with open(path, 'r', encoding='utf-8', errors='replace') as fh:
            html = fh.read()
        if 'class="footer' in html:
            skipped += 1
            continue
        if '</body>' not in html:
            skipped += 1
            continue
        new = html.replace('</body>', FOOTER + '</body>', 1)
        rel = os.path.relpath(path, PUBLIC_DIR)
        if dry_run:
            print(f'  would add footer  {rel}')
        else:
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(new)
            print(f'  checkmark  {rel}')
        changed += 1
    mode = 'DRY RUN' if dry_run else 'DONE'
    print(f'\n[{mode}] {changed} changed, {skipped} skipped.')
    if dry_run:
        print('Run with --run to apply.')

if __name__ == '__main__':
    main()
