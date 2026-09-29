#!/usr/bin/env python3
"""Assemble the YaleDoc single-file application from its parts.

  python3 scripts/assemble.py <out.html> [--nonce HEX]

Concatenates source/parts/* into one self-contained HTML file and injects a
single build nonce into BOTH the CSP <meta> and the executable <script>, so a
pasted or imported <script> cannot run even if it somehow survived sanitising.

Structural invariants are asserted here; scripts/build.py additionally proves
the file boots in a real browser.
"""
import argparse
import hashlib
import re
import secrets
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "source" / "parts"
PARTS = ["01_head.html", "02_body.html", "03_core.js", "04_ui.js", "05_editor.js", "06_io.js"]
NONCE_TOKEN = "__YD_NONCE__"


def assemble(out: Path, nonce: str | None = None) -> str:
    nonce = nonce or secrets.token_hex(16)
    head = (SRC / PARTS[0]).read_text(encoding="utf-8")
    body = (SRC / PARTS[1]).read_text(encoding="utf-8")
    js = "\n".join((SRC / p).read_text(encoding="utf-8") for p in PARTS[2:])
    js = js.rstrip() + "\n"
    if NONCE_TOKEN in js:
        raise SystemExit("nonce token must not appear in the script body")
    if head.count(NONCE_TOKEN) != 1 or body.count(NONCE_TOKEN) != 1:
        raise SystemExit(f"expected exactly one nonce token in head and body, got {head.count(NONCE_TOKEN)}/{body.count(NONCE_TOKEN)}")
    html = head.replace(NONCE_TOKEN, nonce) + body.replace(NONCE_TOKEN, nonce) + js
    if html.count(NONCE_TOKEN):
        raise SystemExit("unsubstituted nonce token remains")
    # hard structural checks (match real tags only — the JS contains a `<script[^>]*` regex)
    assert html.count('id="ydPayload"') == 1, "payload script must appear exactly once"
    assert len(re.findall(r"<script[\s>]", html)) == 2, "expected exactly two script elements (data block + app)"
    assert f"script-src 'nonce-{nonce}'" in html, "nonce missing from CSP"
    assert f'<script nonce="{nonce}">' in html, "nonce missing from script tag"
    assert "</html>" in html.strip()[-40:], "file does not end with </html>"
    out.write_text(html, encoding="utf-8")
    return nonce


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--nonce")
    a = ap.parse_args()
    n = assemble(a.out, a.nonce)
    print(f"assembled {a.out} ({a.out.stat().st_size:,} bytes) nonce={n[:8]}…")
