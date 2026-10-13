#!/usr/bin/env python3
"""
remove-sticky-cta.py
Removes all sticky-cta div blocks (and preceding HTML comments) from every
HTML file under root/public/.

Usage:
  python3 remove-sticky-cta.py          # dry run
  python3 remove-sticky-cta.py --run    # apply changes
"""

import os
import re
import sys

PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))


def remove_sticky_cta(html):
    result = []
    i = 0
    length = len(html)
    changed = False

    while i < length:
        match = re.search(r'<div\s[^>]*class="sticky-cta"', html[i:], re.IGNORECASE)
        if not match:
            result.append(html[i:])
            break

        start = i + match.start()

        # Include any preceding HTML comment immediately before the div
        block_start = start
        preceding = html[i:start]
        comment_match = re.search(r'[ \t]*<!--[^\n]*-->\s*\n?$', preceding)
        if comment_match:
            block_start = i + comment_match.start()

        # Walk forward counting <div> / </div> to find matching close
        depth = 0
        j = start
        while j < length:
            open_m = re.search(r'<div[\s>]', html[j:], re.IGNORECASE)
            close_m = re.search(r'</div\s*>', html[j:], re.IGNORECASE)

            if open_m is None and close_m is None:
                result.append(html[j:])
                j = length
                break

            open_pos = j + open_m.start() if open_m else length
            close_pos = j + close_m.start() if close_m else length

            if open_pos < close_pos:
                depth += 1
                j = open_pos + len(open_m.group(0))
            else:
                depth -= 1
                end = close_pos + len(close_m.group(0))
                j = end
                if depth == 0:
                    if j < length and html[j] == '\n':
                        j += 1
                    break

        result.append(html[i:block_start])
        i = j
        changed = True

    return ''.join(result), changed


def collect_html_files():
    files = []
    for root, dirs, filenames in os.walk(PUBLIC_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for fname in filenames:
            if fname.endswith('.html'):
                files.append(os.path.join(root, fname))
    return sorted(files)


def main():
    dry_run = '--run' not in sys.argv
    files = collect_html_files()
    changed_count = skipped_count = error_count = 0

    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                original = f.read()

            if 'sticky-cta' not in original:
                skipped_count += 1
                continue

            new_html, changed = remove_sticky_cta(original)

            if not changed:
                skipped_count += 1
                continue

            if dry_run:
                print(f'  would change  {os.path.relpath(filepath, PUBLIC_DIR)}')
            else:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_html)
                print(f'  checkmark  {os.path.relpath(filepath, PUBLIC_DIR)}')

            changed_count += 1

        except Exception as e:
            print(f'  error  {os.path.relpath(filepath, PUBLIC_DIR)}: {e}')
            error_count += 1

    mode = 'DRY RUN' if dry_run else 'DONE'
    print(f'\n[{mode}] {changed_count} changed, {skipped_count} skipped, {error_count} errors.')
    if dry_run:
        print('Run with --run to apply.')


if __name__ == '__main__':
    main()
