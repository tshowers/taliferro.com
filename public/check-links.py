#!/usr/bin/env python3
"""
check-links.py
Checks every href in every HTML file under root/public/.

Internal links  — verified by file existence on disk (instant, no server).
External links  — verified via HTTP HEAD request (opt-in with --external).

Usage:
  python3 check-links.py                    # internal links only
  python3 check-links.py --external         # also check external URLs
  python3 check-links.py --file about.html  # single file
  python3 check-links.py --summary          # broken links only (less noise)
"""

import os, re, sys, time
from pathlib import Path
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))

HREF_RE = re.compile(r'\bhref=["\']([^"\'#][^"\']*|#[^"\']*)["\']', re.IGNORECASE)

SKIP_SCHEMES = {'mailto', 'tel', 'javascript', 'data'}


def resolve(href, source_file):
    """Return ('internal', abs_path) | ('external', url) | ('anchor', None) | ('skip', None)."""
    bare = href.split('#')[0].strip()
    if not bare:
        return 'anchor', None

    parsed = urlparse(bare)
    if parsed.scheme in SKIP_SCHEMES:
        return 'skip', None
    if parsed.scheme in ('http', 'https'):
        return 'external', bare

    if bare.startswith('/'):
        target = os.path.normpath(os.path.join(PUBLIC_DIR, bare.lstrip('/')))
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(source_file), bare))

    target = unquote(target)

    # Directory → look for index.html
    if os.path.isdir(target):
        target = os.path.join(target, 'index.html')

    return 'internal', target


def check_external(url, timeout=8):
    """Return (ok: bool, status: str)."""
    try:
        req = Request(url, method='HEAD', headers={'User-Agent': 'TaliferroLinkChecker/1.0'})
        with urlopen(req, timeout=timeout) as r:
            return True, str(r.status)
    except HTTPError as e:
        return False, str(e.code)
    except URLError as e:
        return False, str(e.reason)
    except Exception as e:
        return False, str(e)


def collect_files(target_file=None):
    if target_file:
        p = os.path.normpath(os.path.join(PUBLIC_DIR, target_file))
        return [p] if os.path.isfile(p) else []
    result = []
    for root, dirs, files in os.walk(PUBLIC_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith('.html'):
                result.append(os.path.join(root, f))
    return sorted(result)


def main():
    check_ext = '--external' in sys.argv
    summary_only = '--summary' in sys.argv

    file_arg = None
    if '--file' in sys.argv:
        idx = sys.argv.index('--file')
        if idx + 1 < len(sys.argv):
            file_arg = sys.argv[idx + 1]

    files = collect_files(file_arg)

    total_links = broken_internal = broken_external = ok_internal = ok_external = 0
    broken = []  # (file_rel, href, reason)

    ext_cache = {}  # url → (ok, status) — avoid re-checking same URL

    for filepath in files:
        rel = os.path.relpath(filepath, PUBLIC_DIR)
        try:
            content = open(filepath, encoding='utf-8', errors='replace').read()
        except Exception:
            continue

        hrefs = HREF_RE.findall(content)
        file_broken = []

        for href in hrefs:
            total_links += 1
            kind, target = resolve(href, filepath)

            if kind == 'internal':
                if os.path.isfile(target):
                    ok_internal += 1
                else:
                    broken_internal += 1
                    file_broken.append((href, 'FILE NOT FOUND'))

            elif kind == 'external' and check_ext:
                if target in ext_cache:
                    ok, status = ext_cache[target]
                else:
                    ok, status = check_external(target)
                    ext_cache[target] = (ok, status)
                if ok:
                    ok_external += 1
                else:
                    broken_external += 1
                    file_broken.append((href, f'HTTP {status}'))

        if file_broken:
            if not summary_only:
                print(f'\n  {rel}')
                for href, reason in file_broken:
                    print(f'    [{reason}]  {href}')
            broken.extend((rel, h, r) for h, r in file_broken)

    # Summary
    print(f'\n{"="*60}')
    print(f'Files checked    : {len(files)}')
    print(f'Links scanned    : {total_links}')
    print(f'Internal OK      : {ok_internal}')
    print(f'Internal broken  : {broken_internal}')
    if check_ext:
        print(f'External OK      : {ok_external}')
        print(f'External broken  : {broken_external}')
    print(f'{"="*60}')

    if summary_only and broken:
        print('\nBroken links:')
        for file_rel, href, reason in broken:
            print(f'  [{reason}]  {file_rel}  →  {href}')

    sys.exit(1 if broken_internal + broken_external else 0)


if __name__ == '__main__':
    main()
