#!/usr/bin/env python3
"""
fix-best-practices.py
Three targeted fixes to improve Lighthouse Best Practices scores:

  1. Move <meta charset> to first element inside <head> (778 pages have it after scripts)
  2. Wrap Bing UET script in an isLocal guard (matches the GA guard already in place)
  3. Add <meta name="viewport"> to any page missing it (3 pages)

Usage:
  python3 fix-best-practices.py          # dry-run: shows stats only
  python3 fix-best-practices.py --run    # apply changes
"""

import re, os, sys

DRY  = '--run' not in sys.argv
PUB  = os.path.dirname(os.path.abspath(__file__))

VIEWPORT_TAG = '  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />\n'

# Bing UET script — unique signature is bat.bing.net inside a <script> tag on one line
BING_RE = re.compile(
    r'([ \t]*)(<script>)((?:[^<]|<(?!/script>))*bat\.bing\.net(?:[^<]|<(?!/script>))*)(</script>)',
    re.DOTALL
)

# <meta charset=...> tag (self-closing or not, various quoting)
CHARSET_RE = re.compile(r'[ \t]*<meta\s+charset=[^\n>]+/?>\n?', re.IGNORECASE)

stats = {'charset_moved': 0, 'bing_guarded': 0, 'viewport_added': 0,
         'unchanged': 0, 'errors': 0, 'total': 0}


def process(path):
    try:
        original = open(path, encoding='utf-8').read()
    except Exception as e:
        stats['errors'] += 1
        return

    html = original
    changed = False

    # ── 1. Move <meta charset> to first inside <head> ──────────────────────
    m = CHARSET_RE.search(html)
    if m:
        charset_tag = m.group(0).strip()   # e.g. <meta charset="utf-8" />
        # Only move if it's NOT already the first non-whitespace thing after <head>
        head_pos = html.find('<head>')
        if head_pos >= 0:
            head_end = head_pos + len('<head>')
            # What's right after <head> (skip newline/spaces)?
            after_head = html[head_end:head_end + 60].lstrip('\n')
            if not after_head.startswith('<meta charset'):
                # Remove current charset tag
                html = CHARSET_RE.sub('', html, count=1)
                # Insert after <head>
                insert_after = html.find('<head>') + len('<head>')
                html = html[:insert_after] + '\n  ' + charset_tag + '\n' + html[insert_after:]
                changed = True
                stats['charset_moved'] += 1

    # ── 2. Wrap Bing UET script in isLocal guard ────────────────────────────
    def wrap_bing(m):
        indent   = m.group(1)
        opentag  = m.group(2)   # <script>
        body     = m.group(3)   # inline JS content
        closetag = m.group(4)   # </script>
        guard = (
            "if(!(location.hostname==='127.0.0.1'||location.hostname==='localhost'"
            "||location.hostname==='0.0.0.0'||location.hostname==='[::1]'"
            "||location.protocol==='file:')){" + body.strip() + "}"
        )
        return f'{indent}{opentag}{guard}{closetag}'

    if 'bat.bing.net' in html:
        # Skip if already guarded
        bing_m = BING_RE.search(html)
        if bing_m and 'location.hostname' not in html[:bing_m.start() + 30]:
            # Check the script content doesn't already have the guard
            script_content = bing_m.group(3)
            if 'location.hostname' not in script_content:
                html = BING_RE.sub(wrap_bing, html, count=1)
                changed = True
                stats['bing_guarded'] += 1

    # ── 3. Add viewport if missing ──────────────────────────────────────────
    if 'name="viewport"' not in html:
        # Insert after the charset tag (now at top of head)
        charset_end = html.find('<meta charset')
        if charset_end >= 0:
            line_end = html.find('\n', charset_end)
            if line_end >= 0:
                html = html[:line_end + 1] + VIEWPORT_TAG + html[line_end + 1:]
                changed = True
                stats['viewport_added'] += 1

    stats['total'] += 1
    if changed:
        if not DRY:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(html)
    else:
        stats['unchanged'] += 1


for root, dirs, files in os.walk(PUB):
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for fname in files:
        if fname.endswith('.html'):
            process(os.path.join(root, fname))

mode = 'DRY RUN' if DRY else 'APPLIED'
print(f'fix-best-practices.py — {mode}')
print(f'  HTML files scanned : {stats["total"]}')
print(f'  Charset moved      : {stats["charset_moved"]}')
print(f'  Bing guard added   : {stats["bing_guarded"]}')
print(f'  Viewport added     : {stats["viewport_added"]}')
print(f'  Already OK         : {stats["unchanged"]}')
print(f'  Errors             : {stats["errors"]}')
if DRY:
    print('\nRe-run with --run to apply changes.')
