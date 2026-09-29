#!/usr/bin/env python3
"""Generate dist/YaleDoc-Demo.ydoc.html by driving a real browser.

The demo is a genuine encrypted document produced by the shipped application,
not a hand-written fixture, so it can never drift from the real format.

    python3 scripts/make_demo.py                 # password: the DEMO_PASSWORD below
    python3 scripts/make_demo.py --password "x"  # build a custom one
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BLANK = ROOT / "dist" / "YaleDoc-Blank.ydoc.html"
DEMO = ROOT / "dist" / "YaleDoc-Demo.ydoc.html"
DEMO_PASSWORD = "YaleDoc-Demo-2026"

SAMPLE = """
<h1>A short tour of YaleDoc</h1>
<p>You are reading a document that is <strong>a file</strong>. There is no server, no
account and no cloud copy: this paragraph is AES-256-GCM ciphertext sitting in a
JSON block inside an HTML file, and the only thing that ever decrypted it was
your password.</p>
<blockquote><p>If you forget the password, nobody can read this — including you.
That is the feature, not a limitation.</p></blockquote>
<h2>What it can do</h2>
<ul>
<li><b>Markdown shortcuts</b> — type <code># </code> for a heading, <code>- </code> for a list,
<code>&gt; </code> for a quote, <code>[] </code> for a to-do, or <code>/</code> for the insert menu.</li>
<li><b>Real structure</b> — headings, lists, tables, to-dos, code blocks, quotes and images.</li>
<li><b>Tables</b> with row, column and header controls that appear when the caret is inside one.</li>
<li><b>Find and replace</b> (Ctrl+F / Ctrl+H) that never damages the document.</li>
<li><b>Version history</b> — encrypted snapshots live inside the file, so undo survives a reload.</li>
<li><b>Attachments</b> — any file, encrypted into the document itself.</li>
<li><b>Markdown and plain-text export</b>, and Markdown import, for interoperability.</li>
<li><b>Three themes</b>, four font stacks, A4 or US Letter, measured page guides, focus and reading modes.</li>
<li><b>English and বাংলা</b> interface.</li>
</ul>
<h2>Try these</h2>
<ol>
<li>Press <code>Ctrl+K</code> and search for <em>table</em>.</li>
<li>Press <code>Ctrl+F</code> and look for <em>ciphertext</em>.</li>
<li>Open the side panel (Ctrl+\\) and click <b>History</b>, then take a snapshot.</li>
<li>Type <code>[] </code> on a new line to start a to-do list.</li>
<li>Change the theme, then press <code>Ctrl+S</code> and reopen the file you saved.</li>
</ol>
<h2>What it refuses to do</h2>
<p>Make a single network request. Run a script that was pasted into it. Write your
password to disk. Load a font or a stylesheet from anywhere. The page's
Content-Security-Policy is <code>default-src 'none'</code> and the document's only
script is allowed by a build-time nonce, so even a successful HTML-injection bug
would not be able to execute anything.</p>
<table>
<thead><tr><th>Layer</th><th>Choice</th><th>Because</th></tr></thead>
<tbody>
<tr><td>Cipher</td><td>AES-256-GCM</td><td>Authenticated; a flipped bit is detected</td></tr>
<tr><td>Key derivation</td><td>PBKDF2-HMAC-SHA-256</td><td>Present in every browser, calibrated to the device</td></tr>
<tr><td>Sanitiser</td><td>Tag allow-list</td><td>Deny-lists leak; allow-lists do not</td></tr>
<tr><td>Payload</td><td>JSON data block</td><td>Not a script, so CSP cannot block reading it</td></tr>
</tbody>
</table>
<p>Save this file, send it to someone, and the only thing they need is the password.</p>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--password", default=DEMO_PASSWORD)
    ap.add_argument("--out", type=Path, default=DEMO)
    args = ap.parse_args()
    if not BLANK.exists():
        print("error: run scripts/build.py first", file=sys.stderr)
        return 1

    for exe in ("/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"):
        launch = {"executable_path": exe} if Path(exe).exists() else {}
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, **launch)
            page = b.new_page()
            page.goto("file://" + str(BLANK))
            page.wait_for_selector("#setupScreen:not(.hidden)", timeout=20000)
            page.fill("#setupPw", args.password)
            page.fill("#setupPw2", args.password)
            page.click("#setupGo")
            page.wait_for_selector("#app:not(.hidden)", timeout=60000)
            page.fill("#docTitle", "A short tour of YaleDoc")
            page.evaluate("(h)=>{const e=document.getElementById('ydPages');e.innerHTML=h;"
                          "e.dispatchEvent(new Event('input',{bubbles:true}));}", SAMPLE)
            page.wait_for_timeout(400)
            out = page.evaluate("async () => { const b = await window.__yd.makeBlobNow(); return window.__yd.buildFileString(b); }")
            b.close()
        break

    args.out.write_text(out, encoding="utf-8")
    size = args.out.stat().st_size
    print(f"Built {args.out} ({size:,} bytes)")
    print(f"Password: {args.password}")
    # a demo that cannot be opened is worse than no demo
    assert "<!--YD:START-->" in out and '"c"' in out, "demo has no ciphertext"
    return 0


if __name__ == "__main__":
    sys.exit(main())
