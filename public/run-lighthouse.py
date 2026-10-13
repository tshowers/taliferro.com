#!/usr/bin/env python3
"""
run-lighthouse.py
Runs Google Lighthouse against pages on this static site and produces a
scored report sorted by SEO score (lowest first).

Prerequisites:
  npm install -g lighthouse          # one-time global install
  Node.js >= 18

Usage:
  python3 run-lighthouse.py                         # sample of key pages
  python3 run-lighthouse.py --all                   # every HTML page (slow)
  python3 run-lighthouse.py --file about.html       # single page
  python3 run-lighthouse.py --dir rescue-me         # all pages under a directory
  python3 run-lighthouse.py --port 9090             # custom port (default 8099)
  python3 run-lighthouse.py --csv report.csv        # also write CSV

Lighthouse categories scored (0-100):
  SEO · Performance · Accessibility · Best Practices
"""

import os, sys, json, csv, time, signal, shutil, subprocess, threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))

# Pages checked in "sample" mode — the most important ones for SEO/UX
SAMPLE_PAGES = [
    'index.html',
    'about.html',
    'contact.html',
    'case-studies.html',
    'sitemap.html',
    'agile-coaching/index.html',
    'api-consulting/index.html',
    'cloud-architecture-consulting/index.html',
    'machine-learning-services/index.html',
    'website-development/index.html',
    'ecommerce-development/index.html',
    'fractional-cto/index.html',
    'todd/index.html',
    'lead-vault/index.html',
    'business-momentum-system/index.html',
    'rescue-me/ship-faster/index.html',
    'rescue-me/cloud-cost-control/index.html',
    'team/tyrone-showers/index.html',
]


def collect_all_pages():
    pages = []
    for root, dirs, files in os.walk(PUBLIC_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith('.html'):
                rel = os.path.relpath(os.path.join(root, f), PUBLIC_DIR)
                pages.append(rel)
    return sorted(pages)


class QuietHTTPServer(HTTPServer):
    """Suppress BrokenPipeError/ConnectionResetError — normal when Chrome closes connections."""
    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


def start_server(port):
    os.chdir(PUBLIC_DIR)
    handler = SimpleHTTPRequestHandler
    handler.log_message = lambda *a: None  # silence access log
    server = QuietHTTPServer(('127.0.0.1', port), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


def lighthouse_available():
    return shutil.which('lighthouse') is not None or _npx_has('lighthouse')


def _npx_has(pkg):
    try:
        r = subprocess.run(['npx', '--yes', pkg, '--version'],
                           capture_output=True, timeout=30)
        return r.returncode == 0
    except Exception:
        return False


def run_lighthouse(url, tmp_json):
    lh = shutil.which('lighthouse') or 'npx'
    if lh == 'npx':
        base_cmd = ['npx', 'lighthouse']
    else:
        base_cmd = [lh]

    cmd = base_cmd + [
        url,
        '--output=json',
        f'--output-path={tmp_json}',
        '--quiet',
        '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
        '--only-categories=performance,accessibility,best-practices,seo',
        '--max-wait-for-load=45000',
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=120)
    if r.returncode != 0 and r.stderr:
        print(f'\n    [lighthouse error] {r.stderr.decode(errors="replace").strip()[:200]}')
    return r.returncode == 0


def parse_scores(tmp_json):
    try:
        with open(tmp_json) as f:
            data = json.load(f)
        cats = data.get('categories', {})
        def score(key):
            v = cats.get(key, {}).get('score')
            return round(v * 100) if v is not None else None
        bp_key = next((k for k in cats if 'best' in k.lower()), 'best-practices')
        return {
            'seo':           score('seo'),
            'performance':   score('performance'),
            'accessibility': score('accessibility'),
            'best_practices': score(bp_key),
        }
    except Exception as e:
        return {}


def color(score):
    if score is None: return '  ?'
    if score >= 90:   return f'\033[32m{score:3}\033[0m'  # green
    if score >= 50:   return f'\033[33m{score:3}\033[0m'  # yellow
    return               f'\033[31m{score:3}\033[0m'      # red


def main():
    port = 8099
    csv_path = None
    run_all = '--all' in sys.argv
    file_arg = None

    dir_arg = None

    if '--port' in sys.argv:
        idx = sys.argv.index('--port')
        port = int(sys.argv[idx + 1])
    if '--csv' in sys.argv:
        idx = sys.argv.index('--csv')
        csv_path = sys.argv[idx + 1]
    if '--file' in sys.argv:
        idx = sys.argv.index('--file')
        file_arg = sys.argv[idx + 1]
    if '--dir' in sys.argv:
        idx = sys.argv.index('--dir')
        dir_arg = sys.argv[idx + 1].rstrip('/')

    if file_arg:
        pages = [file_arg]
    elif dir_arg:
        target = os.path.join(PUBLIC_DIR, dir_arg)
        if not os.path.isdir(target):
            print(f'Error: directory not found: {target}')
            sys.exit(1)
        pages = sorted(
            os.path.relpath(os.path.join(r, f), PUBLIC_DIR)
            for r, _, files in os.walk(target)
            for f in files if f.endswith('.html')
        )
        if not pages:
            print(f'No HTML files found under {dir_arg}/')
            sys.exit(1)
    elif run_all:
        pages = collect_all_pages()
    else:
        pages = [p for p in SAMPLE_PAGES if os.path.isfile(os.path.join(PUBLIC_DIR, p))]

    print(f'Starting local server on port {port}...')
    server = start_server(port)
    time.sleep(0.5)

    tmp = os.path.join(PUBLIC_DIR, '_lh_tmp.json')
    results = []

    print(f'Running Lighthouse on {len(pages)} page(s). This may take a while...\n')
    print(f'{"Page":<55} {"SEO":>4} {"Perf":>5} {"A11y":>5} {"BP":>4}')
    print('-' * 74)

    for i, page in enumerate(pages, 1):
        url = f'http://127.0.0.1:{port}/{page}'
        sys.stdout.write(f'  [{i:3}/{len(pages)}] {page[:50]:<50} ')
        sys.stdout.flush()

        ok = run_lighthouse(url, tmp)
        if ok and os.path.isfile(tmp):
            scores = parse_scores(tmp)
            try: os.remove(tmp)
            except: pass
        else:
            scores = {}

        seo  = scores.get('seo')
        perf = scores.get('performance')
        a11y = scores.get('accessibility')
        bp   = scores.get('best_practices')

        print(f'{color(seo):>8} {color(perf):>8} {color(a11y):>8} {color(bp):>8}')
        results.append({'page': page, 'seo': seo, 'performance': perf,
                        'accessibility': a11y, 'best_practices': bp})

    server.shutdown()

    # Sort by SEO score ascending (worst first)
    results.sort(key=lambda r: (r['seo'] or 0))

    print(f'\n{"="*74}')
    print('LOWEST SEO SCORES (fix these first):')
    for r in results[:10]:
        s = r['seo']
        mark = '  OK' if (s or 0) >= 90 else '  !!!'
        print(f"  {r['page']:<55} SEO {s or '?':>3}{mark}")

    if csv_path:
        with open(csv_path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['page','seo','performance','accessibility','best_practices'])
            w.writeheader()
            w.writerows(results)
        print(f'\nCSV written → {csv_path}')

    print(f'\nDone. {len(results)} pages audited.')


if __name__ == '__main__':
    main()
