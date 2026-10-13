#!/usr/bin/env python3
"""
migrate-styles.py
Migrates all Taliferro HTML pages to taliferro-styles-v15.css design.

Skips:
  - /root/public/index.html  (home page)
  - /root/public/rescue-me/index.html

Usage:
  python3 migrate-styles.py            # dry run (prints file list, no changes)
  python3 migrate-styles.py --run      # apply changes
  python3 migrate-styles.py --run --file about.html  # single file test
"""

import os
import re
import sys
import argparse

PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))

SKIP_FILES = {
    os.path.normpath(os.path.join(PUBLIC_DIR, 'index.html')),
    os.path.normpath(os.path.join(PUBLIC_DIR, 'rescue-me', 'index.html')),
    # Skip the migration script itself (not an HTML file, but safety)
}

THEME_SCRIPT = """\
    <script>
        (function () {
            var btn = document.querySelector('.theme-toggle');
            if (!btn) return;
            var saved = localStorage.getItem('taliferro-theme');
            var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            function setTheme(mode) {
                var isDark = mode === 'dark';
                document.body.classList.toggle('theme-dark', isDark);
                btn.textContent = isDark ? 'Light' : 'Dark';
                btn.setAttribute('aria-pressed', String(isDark));
                localStorage.setItem('taliferro-theme', mode);
            }
            setTheme(saved || (prefersDark ? 'dark' : 'light'));
            btn.addEventListener('click', function () {
                setTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark');
            });
        })();
    </script>"""


def slugify(text):
    t = re.sub(r'<[^>]+>', '', text).strip().lower()
    t = re.sub(r'[^\w\s-]', '', t)
    t = re.sub(r'[\s_-]+', '-', t)
    return t.strip('-')[:50]


def rel_prefix(filepath):
    """Return '../' repeated by directory depth from PUBLIC_DIR."""
    relpath = os.path.relpath(filepath, PUBLIC_DIR)
    depth = len(relpath.split(os.sep)) - 1
    return '../' * depth


def step_css(html, css_href, is_new_style):
    """Remove old CSS references; add new shared stylesheet link."""
    if is_new_style:
        # Remove embedded <style> block that contains the case study CSS vars
        html = re.sub(
            r'[ \t]*<style[^>]*>.*?--ink:.*?</style>[ \t]*\n?',
            '',
            html,
            flags=re.DOTALL | re.IGNORECASE,
        )
    else:
        # Remove old external stylesheet links
        html = re.sub(
            r'[ \t]*<link[^>]+href=["\'][^"\']*'
            r'(?:taliferro-styles-min-v\d+|home(?:-v\d+)?)\.css[^"\']*["\']'
            r'[^>]*/?>[ \t]*\n?',
            '',
            html,
            flags=re.IGNORECASE,
        )

    # Insert new CSS link before </head> if not already present
    if 'taliferro-styles-v15.css' not in html:
        link = f'    <link rel="stylesheet" href="{css_href}">\n'
        html = html.replace('</head>', link + '</head>', 1)

    return html


def step_remove_video(html):
    """Remove bgVideoOverlay div and video init script."""
    # bgVideoOverlay div — always empty, single line
    html = re.sub(
        r'[ \t]*<div[^>]+class=["\']bgVideoOverlay["\'][^>]*>[ \t]*</div>[ \t]*\n?',
        '',
        html,
        flags=re.IGNORECASE,
    )

    # Inline <style> blocks containing video-related CSS rules
    def maybe_remove_style(m):
        content = m.group(0)
        if '.bgVideo' in content or 'videoReady' in content:
            return ''
        return content

    html = re.sub(
        r'[ \t]*<style[^>]*>.*?</style>[ \t]*\n?',
        maybe_remove_style,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # Video init script: identified by querySelector('.bgVideo')
    def maybe_remove_script(m):
        if "querySelector('.bgVideo')" in m.group(0) or 'querySelector(".bgVideo")' in m.group(0):
            return ''
        return m.group(0)

    html = re.sub(
        r'[ \t]*<script[^>]*>.*?</script>[ \t]*\n?',
        maybe_remove_script,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # home-page-intent.js deferred script (handles both <script src="..."></script> and <script src="..."/>)
    html = re.sub(
        r'[ \t]*<script[^>]+src=["\'][^"\']*home-page-intent[^"\']*["\'][^>]*>[ \t]*</script>[ \t]*\n?',
        '',
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(
        r'[ \t]*<script[^>]+src=["\'][^"\']*home-page-intent[^"\']*["\'][^>]*/>[ \t]*\n?',
        '',
        html,
        flags=re.IGNORECASE,
    )
    # Clean up any stray </script> that sits alone directly before the v15 CSS link
    # (leftover from prior migration runs that removed the opening tag but not the closing)
    html = re.sub(
        r'[ \t]*</script>[ \t]*\n(?=[ \t]*<link[^>]+taliferro-styles-v15)',
        '\n',
        html,
        flags=re.IGNORECASE,
    )

    return html


def step_add_h2_ids(html):
    """Add id attributes to h2 elements that lack one, for anchor navigation."""
    seen = set()

    def replace_h2(m):
        opening, inner, closing = m.group(1), m.group(2), m.group(3)
        # Already has an id — leave as-is
        if re.search(r'\bid=', opening, re.IGNORECASE):
            return m.group(0)
        text = re.sub(r'<[^>]+>', '', inner).strip()
        slug = slugify(text)
        if not slug:
            return m.group(0)
        # Deduplicate slugs within the page
        base, count = slug, 0
        while slug in seen:
            count += 1
            slug = f'{base}-{count}'
        seen.add(slug)
        new_opening = re.sub(r'^<h2', f'<h2 id="{slug}"', opening, count=1, flags=re.IGNORECASE)
        return new_opening + inner + closing

    return re.sub(
        r'(<h2(?:\s[^>]*)?>)(.*?)(</h2>)',
        replace_h2,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )


def step_add_topbar(html, logo_src):
    """Insert or rebuild the migration-generated topbar."""
    # Remove any topbar previously written by this script (identifiable by
    # aria-label="Page navigation") so it can be rebuilt with updated labels.
    # Topbars that belong to the original page content (e.g. support-material
    # case studies with aria-label="Case study navigation") are left alone.
    html = re.sub(
        r'[ \t]*<header[^>]+class="topbar[^"]*"[^>]*>.*?</header>[ \t]*\n?',
        lambda m: '' if 'aria-label="Page navigation"' in m.group(0) else m.group(0),
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )

    if 'class="topbar' in html:
        return html  # original page topbar (case study / fractional-cto etc.) — leave alone

    # Collect h2 ids and their display text (first 5)
    h2_entries = []
    for m in re.finditer(
        r'<h2[^>]+\bid=["\']([^"\']+)["\'][^>]*>(.*?)</h2>',
        html,
        flags=re.DOTALL | re.IGNORECASE,
    ):
        anchor_id = m.group(1)
        text = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        # Trim to first 2 words for nav legibility
        words = text.split()
        display = ' '.join(words[:2]) if words else anchor_id.replace('-', ' ')
        h2_entries.append((anchor_id, display))
        if len(h2_entries) >= 5:
            break

    nav_items = ''.join(
        f'\n                <a href="#{aid}">{txt}</a>'
        for aid, txt in h2_entries
    )

    topbar = (
        f'    <header class="topbar no-print">\n'
        f'        <div class="page-shell topbar-inner">\n'
        f'            <a class="brand" href="https://taliferro.com" aria-label="Taliferro home">\n'
        f'                <img class="brandLogo" src="{logo_src}" alt="Taliferro logo"'
        f' loading="lazy" onerror="this.style.display=\'none\'" />\n'
        f'                <span>Taliferro Group</span>\n'
        f'            </a>\n'
        f'            <nav class="nav-links" aria-label="Page navigation">{nav_items}\n'
        f'                <button class="theme-toggle" type="button"'
        f' aria-label="Toggle dark mode" aria-pressed="false">Dark</button>\n'
        f'                <a class="button button-primary"'
        f' href="https://taliferro.com/contact.html">Get Started</a>\n'
        f'            </nav>\n'
        f'        </div>\n'
        f'    </header>\n'
    )

    return re.sub(r'(<body[^>]*>)', r'\1\n' + topbar, html, count=1, flags=re.IGNORECASE)


def step_update_classes(html):
    """Rename legacy class values to v15 equivalents."""
    html = re.sub(r'\bclass="wrap"', 'class="page-shell"', html)
    html = re.sub(r"\bclass='wrap'", "class='page-shell'", html)
    # btn variants (order matters — most-specific first)
    html = re.sub(r'\bclass="btn primary"', 'class="button button-primary"', html)
    html = re.sub(r"\bclass='btn primary'", "class='button button-primary'", html)
    html = re.sub(r'\bclass="btn ghost"', 'class="button"', html)
    html = re.sub(r"\bclass='btn ghost'", "class='button'", html)
    return html


def step_fix_theme_key(html):
    """Normalise localStorage key to 'taliferro-theme' across all pages."""
    return re.sub(r"'taliferro-(?!theme')[a-z-]+-theme'", "'taliferro-theme'", html)


def step_add_theme_script(html):
    """Inject dark-mode toggle script if topbar button is present but no handler exists."""
    if 'theme-toggle' in html and 'setTheme' not in html:
        html = html.replace('</body>', THEME_SCRIPT + '\n</body>', 1)
    return html


def process_file(filepath, dry_run=False):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        original = f.read()

    html = original

    prefix = rel_prefix(filepath)
    css_href = f'{prefix}css/taliferro-styles-v15.css'
    logo_src = f'{prefix}img/general/taliferro-logo.svg'

    # Detect pages that already use the v15 inline CSS (support-material pages)
    is_new_style = bool(
        re.search(r'<style[^>]*>.*?--ink:', html, flags=re.DOTALL | re.IGNORECASE)
    )

    html = step_css(html, css_href, is_new_style)

    if not is_new_style:
        html = step_remove_video(html)

    html = step_add_h2_ids(html)
    html = step_add_topbar(html, logo_src)
    html = step_update_classes(html)
    html = step_fix_theme_key(html)
    html = step_add_theme_script(html)

    changed = html != original

    if not dry_run and changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

    return changed


def collect_html_files(target_file=None):
    if target_file:
        path = os.path.normpath(os.path.join(PUBLIC_DIR, target_file))
        return [path] if path not in SKIP_FILES else []

    result = []
    for root, dirs, files in os.walk(PUBLIC_DIR):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for fname in files:
            if not fname.endswith('.html'):
                continue
            fpath = os.path.normpath(os.path.join(root, fname))
            if fpath not in SKIP_FILES:
                result.append(fpath)
    return sorted(result)


def main():
    parser = argparse.ArgumentParser(description='Migrate Taliferro pages to v15 style.')
    parser.add_argument('--run', action='store_true', help='Apply changes (default: dry run)')
    parser.add_argument('--file', metavar='PATH', help='Process a single file (relative to public/)')
    args = parser.parse_args()

    dry_run = not args.run
    files = collect_html_files(args.file)

    if dry_run:
        print(f'DRY RUN — {len(files)} file(s) found. Use --run to apply.')
        for f in files[:20]:
            print(' ', os.path.relpath(f, PUBLIC_DIR))
        if len(files) > 20:
            print(f'  ... and {len(files) - 20} more')
        return

    changed = skipped = 0
    for filepath in files:
        try:
            if process_file(filepath, dry_run=False):
                changed += 1
                print(f'  ✓  {os.path.relpath(filepath, PUBLIC_DIR)}')
            else:
                skipped += 1
        except Exception as e:
            print(f'  ✗  {os.path.relpath(filepath, PUBLIC_DIR)}: {e}')

    print(f'\nDone. {changed} changed, {skipped} already up-to-date.')


if __name__ == '__main__':
    main()
