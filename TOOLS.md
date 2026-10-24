# Taliferro Site Tools

Python scripts for maintaining, migrating, and auditing the Taliferro static HTML site.
All scripts live in `root/public/` alongside the HTML files and require only Python 3 (stdlib) unless noted.

---

## migrate-styles.py

Migrates HTML pages to the `taliferro-styles-v15.css` design system.

**What it does:**

- Removes old CSS links (`taliferro-styles-min-v14.css`, `home.css`, `home-v5.css`) and embedded `<style>` blocks
- Adds `<link rel="stylesheet" href="css/taliferro-styles-v21.css">`
- Removes background video infrastructure (`bgVideoOverlay` div, video init script, `home-page-intent.js`)
- Injects a sticky topbar with page-specific section anchor links
- Adds `id` attributes to all `<h2>` elements for anchor navigation
- Renames `.wrap` → `.page-shell`, updates button class names
- Injects dark mode toggle script before `</body>`

**Skips:** `index.html` (home page), `rescue-me/index.html`

```bash
python3 migrate-styles.py                      # dry run — lists files, no changes
python3 migrate-styles.py --run                # apply to all pages
python3 migrate-styles.py --run --file about.html  # single file test
```

---

## label-sections.py

Replaces topbar nav labels with intelligent single-word domain labels.

**What it does:**

- Reads each page's `<h2>` text and matches it against a domain keyword map
- Replaces 2-word sliced labels (e.g. "When Agile", "A practical") with meaningful labels (e.g. "Agile", "Team")
- Only touches topbars with `aria-label="Page navigation"` — preserves original/custom topbars
- Phase 1: non-blog pages. Phase 2: blog folder.

```bash
python3 label-sections.py             # dry run — shows before/after for every label
python3 label-sections.py --run       # Phase 1: apply to all non-blog pages
python3 label-sections.py --run --blog  # Phase 2: apply to blog pages only
```

---

## remove-sticky-cta.py

Removes all `sticky-cta` div blocks (and their preceding HTML comments) from every HTML page.

**What it does:**

- Finds every `<div class="sticky-cta" ...>` block using a depth-counting parser
- Removes the full nested block including the `<!-- Sticky CTA -->` comment above it
- Idempotent — safe to re-run

```bash
python3 remove-sticky-cta.py          # dry run
python3 remove-sticky-cta.py --run    # apply to all pages
```

---

## inject-footer.py

Injects the standard site footer before `</body>` on every HTML page.

**Footer content:**

```
Seattle • Taliferro Tech, LLC • © 2026 Taliferro® is registered in the U.S. Patent and Trademark Office. All rights reserved.
About | Contact | Case Studies | Sitemap
```

**What it does:**

- Skips pages that already have `class="footer"` (idempotent)
- Skips `rescue-me/index.html`
- Uses absolute paths (`/about.html`, `/contact.html`, etc.) so it works at any directory depth

```bash
python3 inject-footer.py              # dry run
python3 inject-footer.py --run        # apply to all pages
```

---

## check-links.py

Checks every `href` in every HTML file for broken links.

**What it does:**

- **Internal links** — verified by file existence on disk (no server needed, instant)
  - Resolves absolute paths (`/about.html`) from the site root
  - Resolves relative paths from the current file's directory
  - Treats trailing-slash paths as `path/index.html`
- **External links** — verified via HTTP HEAD request (opt-in with `--external`)
  - Caches results so the same URL is only checked once
- Skips `mailto:`, `tel:`, `javascript:`, and bare `#anchor` hrefs

```bash
python3 check-links.py                     # internal links, full output
python3 check-links.py --summary           # broken links only (less noise)
python3 check-links.py --external          # also check external URLs via HTTP
python3 check-links.py --file about.html   # single file
```

**Exit codes:** `0` = all links OK, `1` = broken links found (useful in CI).

**Known baseline (June 2026):**

- 800 files, 30,311 links scanned
- 36 broken internal links — all missing asset files (images/videos), no broken page-to-page links

---

## run-lighthouse.py

Runs Google Lighthouse against pages and produces a scored report.

**Requires:**

```bash
npm install -g lighthouse   # one-time install
```

Node.js ≥ 18 must be installed.

**What it does:**

- Starts a local static HTTP server automatically (default port 8099)
- Runs Lighthouse headlessly on each page
- Reports four scores per page (0–100): **SEO · Performance · Accessibility · Best Practices**
- Color-codes results: green ≥ 90, yellow ≥ 50, red < 50
- Sorts final report by SEO score ascending (worst pages first)
- Optionally writes a CSV for spreadsheet analysis

**Default sample** (18 key pages — fast, ~5 min):
`index.html`, `about.html`, `contact.html`, `case-studies.html`, `sitemap.html`,
and the main index of each service, product, and rescue-me section.

```bash
python3 run-lighthouse.py                        # sample of 18 key pages
python3 run-lighthouse.py --all                  # every HTML page (hours)
python3 run-lighthouse.py --file about.html      # single page
python3 run-lighthouse.py --dir rescue-me        # all pages under a directory
python3 run-lighthouse.py --csv report.csv       # also write CSV
python3 run-lighthouse.py --port 9090            # custom port
```

---

## Shared CSS

**`css/taliferro-styles-v22.css`** — site-wide "Spiral" theme (Oct 2026), linked from every page as `/css/taliferro-styles-v22.css`. The top of the file is the design handoff stylesheet unchanged; below it are the rollout additions (site header, v21 compatibility rules, print styles, shared components) and the template sections (blog post, home, rescue, service, contact/about/results/blog index).

Key design tokens:
| Token | Value |
|-------|-------|
| `--bg` | `#eef5f8` (page ground) |
| `--surface` | `#dde9ef` (tinted panel) |
| `--text` | `#0f1e2b` (headings) |
| `--accent` | `#1f63c4` (primary blue) |
| `--cyan-500` | `#1aa3c8` (secondary accent) |
| `--radius-lg` | `28px` (cards, containers) |
| `--max` | `1180px` (max container width) |

Headings use Caprasimo, body text Figtree (both from Google Fonts, imported at the top of the file).

Dark mode is toggled by adding `class="theme-dark"` to `<body>`. The toggle script is stored in `localStorage` under the key `taliferro-theme`.

---

## Theme scripts (Node, in `root/scripts/`)

Both are dependency-free, safe to re-run, and support `--dry-run` and `--file <public/...html>`.

- **`theme-v22-sitewide.mjs`** — on every page: swaps the stylesheet link to v22, sets the theme-color metas, and replaces the `<header class="topbar">` block with the one site header (Rescue / Services / Results / Blog / About + "Get same-day help" → `/#triage`). Run it on any new page, and **re-run it after every edit to the stylesheet**: links carry `?v=<content hash>` because Firebase caches CSS for a day, so the hash change is what makes browsers fetch the new file.
- **`theme-v22-blog-posts.mjs`** — applies the blog post template to dated posts: breadcrumb, author row with date and read time, sticky aside (table of contents from `h2[id]` plus a Rescue card picked by category), tag pills, CTA card, prev/next cards. The article body is kept as-is. Posts already converted are skipped, so run it after adding new posts.

---

## Quick reference

| Task                     | Command                                                    |
| ------------------------ | ---------------------------------------------------------- |
| Check all internal links | `python3 check-links.py --summary`                         |
| Check external links too | `python3 check-links.py --external --summary`              |
| SEO audit (key pages)    | `python3 run-lighthouse.py`                                |
| SEO audit + CSV export   | `python3 run-lighthouse.py --csv report.csv`               |
| Re-label nav sections    | `python3 label-sections.py` (dry run first)                |
| Remove sticky CTAs       | `python3 remove-sticky-cta.py --run`                       |
| Add footer to new pages  | `python3 inject-footer.py --run`                           |
| Re-migrate a single page | `python3 migrate-styles.py --run --file path/to/page.html` |
| Theme a new page         | `node scripts/theme-v22-sitewide.mjs --file public/path.html` |
| After editing v22 CSS    | `node scripts/theme-v22-sitewide.mjs` (refreshes `?v=` hash) |
| Template new blog posts  | `node scripts/theme-v22-blog-posts.mjs`                    |
