#!/usr/bin/env python3
"""
label-sections.py
Reads each page's h2 text and assigns a meaningful 1-word nav label
to each anchor link in the migration-generated topbar.

Phase 1: all non-blog pages
Phase 2 (future): blog sub-folders

Usage:
  python3 label-sections.py            # dry run — prints proposed labels
  python3 label-sections.py --run      # apply changes
  python3 label-sections.py --blog     # process blog folder instead
"""

import os
import re
import sys
import argparse

PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Domain-specific keyword → label mapping
# Checked in order; first match wins.  Keywords are lowercase substrings.
# ---------------------------------------------------------------------------
# Each entry: (list-of-keyword-patterns, label)
# Patterns may include word-boundary markers \b for exact-word matching,
# or be plain substrings for multi-word phrases.
# Checked in order; first match wins.
DOMAIN_MAP = [
    # --- Structural / navigational ---
    ([r'\bbottom line\b', r'\bconclusion\b', r'\bin short\b', r'\bwrap up\b'],    'Summary'),
    ([r'\bresults?\b', r'\boutcome\b', r'\bimpact\b', r'\bmetric\b', r'\bmeasur'], 'Results'),
    ([r'\bchallenge\b', r'\bproblem\b', r'\bpain point\b', r'\bobstacle\b'],      'Challenge'),
    ([r'\bapproach\b', r'\bmethodology\b', r'\bframework\b', r'\bhow we work\b'], 'Approach'),
    ([r'\bsolution\b', r'\bresolve\b', r'\bfix\b'],                               'Solution'),
    ([r'\blessons?\b', r'\btakeaway\b', r'\bkey finding\b'],                      'Lessons'),
    ([r'\bbackground\b', r'\bhistory\b', r'\bthe story\b', r'\bsituation\b'],     'Background'),
    ([r'\bwhy choose\b', r'\bwhy taliferro\b', r'\bwhy us\b', r'\breasons? to\b'],'Why'),
    ([r'\bcontact\b', r'\bget in touch\b', r'\breach out\b', r'\bsend a message\b'],'Contact'),
    ([r'\bpricing\b', r'\bprice\b', r'\bcost\b', r'\brate\b', r'\bfees?\b',
      r'\binvestment\b'],                                                           'Pricing'),
    ([r'\bfaq\b', r'\bfrequently asked\b', r'\bcommon questions?\b'],             'FAQ'),
    ([r'\btestimon', r'\breviews?\b', r'\bwhat clients? say\b'],                  'Reviews'),
    ([r'\bfeatures?\b', r"what's included", r'\bwhat is included\b',
      r'\bcapabilit'],                                                              'Features'),
    ([r'\bbenefits?\b', r'\badvantage\b', r'\bwhat you gain\b'],                  'Benefits'),
    ([r'\bservices?\b', r'\bwhat we offer\b', r'\bwhat we provide\b'],            'Services'),
    ([r'\bteam\b', r'\bour experts\b', r'\bour staff\b', r'\bwho we are\b'],      'Team'),
    # --- Technology domains ---
    ([r'\bmachine learning\b', r'\bartificial intelligence\b', r'\bai-driven\b',
      r'\bai-powered\b', r'\bgenerative ai\b', r'\blarge language\b',
      r'\bai &\b', r'\bai and\b'],                                                 'AI'),
    ([r'\bautomat', r'\bworkflow\b', r'\bno-code\b', r'\blow-code\b'],            'Automation'),
    ([r'\bcloud\b', r'\binfrastructure\b', r'\bkubernetes\b', r'\bcontainer\b',
      r'\bserverless\b'],                                                           'Cloud'),
    ([r'\bapis?\b', r'\bapi-', r'\bintegration\b', r'\bwebhook\b',
      r'\brest\b', r'\bgraphql\b', r'\bendpoint'],                                 'APIs'),
    ([r'\bagile\b', r'\bscrum\b', r'\bkanban\b', r'\bsprint\b', r'\bstandup\b',
      r'\bretrospect'],                                                             'Agile'),
    ([r'\banalytics\b', r'\breporting\b', r'\bdashboard\b', r'\binsight'],        'Data'),
    ([r'\bsecurity\b', r'\bcompliance\b', r'\bprotect\b', r'\bthreat\b'],         'Security'),
    ([r'\bperformance\b', r'\bresponse time\b', r'\blatency\b'],                  'Performance'),
    ([r'\bstrategy\b', r'\broadmap\b', r'\bvision\b', r'\bplanning\b'],          'Strategy'),
    ([r'\bdeploy\b', r'\blaunch\b', r'\bbuild\b', r'\bdevelop\b'],               'Build'),
    ([r'\bsupport\b', r'\bmaintain\b', r'\bmanage\b', r'\bmonitor\b'],           'Support'),
    ([r'\bprocess\b', r'\bphase\b', r'\bstages?\b', r'\bhow it works\b'],        'Process'),
    ([r'\bdesign\b', r'\bux\b', r'\buser experience\b', r'\binterface\b'],        'Design'),
    ([r'\becommerce\b', r'\be-commerce\b', r'\bshopping\b', r'\bcheckout\b'],    'Commerce'),
    ([r'\bseo\b', r'\bweb dev\b', r'\bweb design\b', r'\blanding page\b'],       'Web'),
    ([r'\broi\b', r'\brevenue\b', r'\bprofit\b'],                                 'ROI'),
    ([r'\bscale\b', r'\bgrowth\b', r'\bexpand\b'],                               'Growth'),
    ([r'\btrust\b', r'\breliable\b', r'\bconsistent\b', r'\bguarantee\b'],        'Trust'),
    ([r'\brisk\b', r'\bmitigat'],                                                  'Risk'),
    ([r'\bcommunicat', r'\bmessag', r'\bnotif', r'\balert\b'],                    'Comms'),
    ([r'\bmobile\b', r'\bios\b', r'\bandroid\b'],                                 'Mobile'),
    ([r'\bdatabase\b', r'\bdata store\b', r'\bwarehouse\b'],                      'Database'),
    ([r'\btesting\b', r'\bquality assurance\b', r'\bqa\b'],                       'Testing'),
    ([r'\bdevops\b', r'\bci/cd\b', r'\bpipeline\b'],                             'DevOps'),
    ([r'\bleadership\b', r'\bexecutive\b', r'\bcto\b', r'\bfractional\b'],        'Leadership'),
    ([r'\badvisor', r'\bguidance\b', r'\badvice\b', r'\bexpert'],                 'Advisory'),
    ([r'\bsmall business\b', r'\bstartup\b', r'\bentrepreneur\b'],                'SMB'),
    ([r'\bhealthcare\b', r'\bmedical\b', r'\bhospital\b', r'\bpatient\b'],        'Healthcare'),
    ([r'\bretail\b', r'\brestaurant\b', r'\bhospitality\b'],                      'Retail'),
    ([r'\bfinance\b', r'\bfinancial\b', r'\bbanking\b', r'\bpayment\b'],          'Finance'),
    ([r'\btelecom\b', r'\btelecommunication\b'],                                   'Telecom'),
    ([r'\bcollaborat', r'\bpartner\b', r'\bwork with us\b'],                      'Together'),
    ([r'\bcustomer\b', r'\bclient\b', r'\baudience\b'],                           'Clients'),
    ([r'\bspeed\b', r'\bquick\b', r'\brapid\b', r'\bfast\b'],                    'Speed'),
    ([r'\bvideo\b', r'\bwatch\b', r'\byoutube\b', r'\bone minute\b'],             'Video'),
    ([r'\bpersonal\b', r'\bvalues?\b', r'\bstory\b', r'\bidentity\b'],            'Values'),
    ([r'\bstart\b', r'\bbegin\b', r'\bnext step\b', r'\bget started\b'],          'Start'),
    ([r'\brefund\b', r'\bcancel\b'],                                               'Policy'),
    ([r'\bprivacy\b', r'\bpersonal data\b', r'\bgdpr\b'],                         'Privacy'),
    ([r'\bterms?\b', r'\bagreement\b', r'\bcondition\b'],                         'Terms'),
    ([r'\btodd\b', r'\bplatform\b', r'\bsoftware product\b'],                    'Product'),
    ([r'\blaboratory\b', r'\blims\b', r'\bspecimen\b', r'\bsample\b'],            'Lab'),
    ([r'\bseattle\b', r'\blocal\b', r'\bon-site\b'],                              'Local'),
    ([r'\blearning\b', r'\blearn\b', r'\btraining\b'],                            'Learning'),
    ([r'\bdata\b'],                                                                 'Data'),
]

SKIP_WORDS = {
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'it', 'are', 'was', 'be',
    'been', 'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'when', 'where', 'why', 'how', 'what', 'which', 'if', 'so',
    'than', 'your', 'our', 'their', 'my', 'his', 'her', 'we', 'you',
    'they', 'not', 'just', 'get', 'make', 'let', 'put', 'take', 'give',
    'look', 'need', 'want', 'pick', 'stop', 'go', 'come', 'every', 'all',
    'more', 'most', 'some', 'any', 'each', 'both', 'few', 'into', 'through',
    'during', 'before', 'after', 'up', 'down', 'out', 'off', 'over', 'here',
    'there', 'same', 'only', 'also', 'very', 'too', 'now', 'still', 'then',
    'this', 'these', 'those', 'that', 'about', 'without', 'instead',
    'between', 'while', 'around', 'already', 'always', 'never', 'often',
    'can', 'cannot', "can't", "don't", "doesn't", "isn't", "aren't",
    'even', 'back', 'right', 'left', 'real', 'new', 'old', 'big', 'small',
    'good', 'better', 'best', 'bad', 'true', 'false', 'next', 'last',
    'first', 'second', 'third', 'keep', 'using', 'used', 'use', 'uses',
    'mean', 'means', 'meant', 'think', 'knows', 'know', 'help', 'helps',
    'stop', 'stops', 'work', 'works', 'move', 'moves', 'turn', 'turns',
    'find', 'found', 'feels', 'feel', 'show', 'shows', 'ask', 'tell',
    'saying', 'says', 'said', 'see', 'sees', 'seen', 'hear', 'heard',
}


def _label_used(label, used_labels):
    """Case-insensitive check against used_labels set."""
    if used_labels is None:
        return False
    lo = label.lower()
    return any(u.lower() == lo for u in used_labels)


def smart_label(h2_text, used_labels=None):
    """Return a meaningful 1-word label for a nav anchor."""
    text_lower = h2_text.lower()

    # 1. Domain keyword match — uses regex for word-boundary safety
    for patterns, label in DOMAIN_MAP:
        for pat in patterns:
            if re.search(pat, text_lower, re.IGNORECASE):
                if not _label_used(label, used_labels):
                    return label
                # Label already used — move to next domain group
                break

    # 2. First meaningful word (skip stop-words and short words)
    words = re.sub(r'[^a-zA-Z\s]', ' ', h2_text).split()
    for word in words:
        if word.lower() not in SKIP_WORDS and len(word) > 3:
            label = word.capitalize()
            if not _label_used(label, used_labels):
                return label

    # 3. Any word longer than 2 chars
    for word in words:
        if len(word) > 2:
            label = word.capitalize()
            if not _label_used(label, used_labels):
                return label

    return 'Section'


def get_h2_text_for_id(html, anchor_id):
    """Find the h2 with the given id and return its plain text."""
    m = re.search(
        r'<h2[^>]+\bid=["\']' + re.escape(anchor_id) + r'["\'][^>]*>(.*?)</h2>',
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not m:
        return None
    return re.sub(r'<[^>]+>', '', m.group(1)).strip()


def relabel_file(filepath, dry_run=False):
    """Re-label nav anchors in the migration-generated topbar."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        original = f.read()

    # Only touch topbars generated by the migration script
    if 'aria-label="Page navigation"' not in original:
        return None  # skip (original topbar or no topbar)

    # Extract the topbar nav block
    nav_match = re.search(
        r'(<nav[^>]+aria-label="Page navigation"[^>]*>)(.*?)(</nav>)',
        original,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not nav_match:
        return None

    nav_open, nav_body, nav_close = nav_match.group(1), nav_match.group(2), nav_match.group(3)

    # Find all anchor links pointing to in-page anchors
    link_pattern = re.compile(
        r'(<a[^>]+href=["\']#([^"\']+)["\'][^>]*>)(.*?)(</a>)',
        flags=re.DOTALL | re.IGNORECASE,
    )

    used_labels = set()
    new_nav_body = nav_body
    proposed = []

    for m in link_pattern.finditer(nav_body):
        open_tag, anchor_id, old_text, close_tag = m.group(1), m.group(2), m.group(3), m.group(4)
        h2_text = get_h2_text_for_id(original, anchor_id)
        if not h2_text:
            continue
        label = smart_label(h2_text, used_labels)
        used_labels.add(label)
        proposed.append((anchor_id, h2_text[:60], old_text.strip(), label))
        new_nav_body = new_nav_body.replace(
            m.group(0),
            open_tag + label + close_tag,
            1,
        )

    if not proposed:
        return None

    html = original.replace(nav_open + nav_body + nav_close,
                             nav_open + new_nav_body + nav_close, 1)

    changed = html != original
    if not dry_run and changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

    return proposed if changed else None


def collect_files(blog_mode=False):
    results = []
    for root, dirs, files in os.walk(PUBLIC_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        in_blog = 'blog' in os.path.relpath(root, PUBLIC_DIR).split(os.sep)

        if blog_mode and not in_blog:
            continue
        if not blog_mode and in_blog:
            continue

        for fname in files:
            if not fname.endswith('.html'):
                continue
            fpath = os.path.normpath(os.path.join(root, fname))
            # Respect original exclusions
            if fpath in {
                os.path.normpath(os.path.join(PUBLIC_DIR, 'index.html')),
                os.path.normpath(os.path.join(PUBLIC_DIR, 'rescue-me', 'index.html')),
            }:
                continue
            results.append(fpath)
    return sorted(results)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--blog', action='store_true', help='Process blog folder (Phase 2)')
    args = parser.parse_args()

    files = collect_files(blog_mode=args.blog)
    phase = 'BLOG' if args.blog else 'NON-BLOG'
    dry = not args.run

    if dry:
        print(f'DRY RUN [{phase}] — {len(files)} files. Use --run to apply.\n')

    changed = skipped = 0
    for filepath in files:
        rel = os.path.relpath(filepath, PUBLIC_DIR)
        proposed = relabel_file(filepath, dry_run=dry)
        if proposed is None:
            skipped += 1
            continue
        changed += 1
        print(f'  {rel}')
        for anchor_id, h2, old, new in proposed:
            marker = '' if old == new else f'  {old!r:20s} → {new!r}'
            if marker:
                print(f'    #{anchor_id[:45]:46s}{marker}')

    print(f'\n[{phase}] Done. {changed} changed, {skipped} skipped (original topbar / no topbar).')


if __name__ == '__main__':
    main()
