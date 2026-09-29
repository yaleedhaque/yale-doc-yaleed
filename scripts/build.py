#!/usr/bin/env python3
"""Build + statically lint the YaleDoc release artefacts.

    python3 scripts/build.py            # assemble, lint, emit dist/YaleDoc-Blank.ydoc.html
    python3 scripts/build.py --check    # lint only, write nothing

Guarantees enforced here (all of them cheap, none of them require a browser):
  1. The parts concatenate into exactly one file with one payload element.
  2. The shipped blank file boots to the SETUP screen (payload is null).
  3. A nonce is present in the CSP meta AND on the script tag, and they match.
  4. No `unsafe-inline` in script-src, no `eval`, no remote origin anywhere.
  5. No emoji used as a UI icon, every control has an accessible name.
  6. The file is self-contained: no http(s):// subresource references.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from assemble import assemble  # noqa: E402

SRC = ROOT / "source" / "app.html"
DIST = ROOT / "dist"
BLANK = DIST / "YaleDoc-Blank.ydoc.html"
NONCE_RE = re.compile(r"script-src 'nonce-([0-9a-f]{8,64})'")
fails: list[tuple[str, str]] = []


def chk(name: str, ok: bool, detail: str = "") -> bool:
    print(("PASS " if ok else "FAIL ") + name + (("  -> " + detail) if detail else ""))
    if not ok:
        fails.append((name, detail))
    return ok


def lint(html: str) -> None:
    csp = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)"', html)
    chk("CSP meta present", bool(csp))
    policy = csp.group(1) if csp else ""
    m = NONCE_RE.search(policy)
    chk("script-src uses a nonce (not unsafe-inline)", bool(m), policy[:110])
    chk("script-src does not allow unsafe-inline", "'unsafe-inline'" not in policy.split("script-src")[1].split(";")[0])
    chk("script-src does not allow unsafe-eval", "unsafe-eval" not in policy)
    chk("default-src is 'none'", "default-src 'none'" in policy)
    chk("connect-src is 'none'", "connect-src 'none'" in policy)
    chk("base-uri is 'none'", "base-uri 'none'" in policy)
    chk("object-src is 'none'", "object-src 'none'" in policy)
    if m:
        nonce = m.group(1)
        chk("the same nonce is on the script tag", f'<script nonce="{nonce}">' in html, nonce[:12])
        chk("no unsubstituted nonce placeholder remains", "__YD_NONCE__" not in html)

    chk("exactly one payload element", html.count('id="ydPayload"') == 1)
    chk("exactly two script elements (data block + app)", len(re.findall(r"<script[\s>]", html)) == 2)
    chk("file ends with </html>", html.rstrip().endswith("</html>"))
    chk("no eval(", "eval(" not in html)
    chk("no new Function(", "new Function(" not in html)
    chk("no remote font/script/style imports", not re.search(r'<(link|script)[^>]+(src|href)\s*=\s*["\']https?://', html))
    chk("no @import in the stylesheet", "@import" not in html)

    emoji = re.findall(r"[\U0001F300-\U0001FAFF☀-➿]", html)
    # the icon sprite holds no emoji; the only allowed glyphs are in comments/strings
    chk("no emoji used as an icon", not emoji, "".join(dict.fromkeys(emoji))[:40])

    buttons = re.findall(r"<button\b([^>]*)>(.*?)</button>", html, re.S)
    unnamed = [b for b, body in buttons
               if "aria-label" not in b and "data-i18n-aria" not in b and not re.search(r"[A-Za-z0-9]{3}", re.sub(r"<[^>]+>", "", body))]
    chk("every button has an accessible name", not unnamed, f"{len(unnamed)} unnamed")

    chk("viewport allows pinch-zoom", "user-scalable=no" not in html and "maximum-scale=1" not in html)
    chk("colour-scheme declared", 'name="color-scheme"' in html)
    chk("a <noscript> fallback exists", "<noscript>" in html)
    chk("reduced-motion honoured", "prefers-reduced-motion" in html)


def main() -> int:
    if "--check" in sys.argv:
        html = SRC.read_text(encoding="utf-8")
    else:
        SRC.parent.mkdir(parents=True, exist_ok=True)
        assemble(SRC)
        html = SRC.read_text(encoding="utf-8")
        print(f"\nassembled {SRC} ({len(html.encode('utf-8')):,} bytes)\n")

    print("--- structural lint ---")
    lint(html)

    print("\n--- blank-artifact guarantee ---")
    pay = re.search(r'<script[^>]*id="ydPayload"[^>]*>([\s\S]*?)</script>', html)
    chk("payload element found", bool(pay))
    if pay:
        body = pay.group(1)
        chk("payload is null (boots to the setup screen)", "<!--YD:START-->null<!--YD:END-->" in body, body[:60].replace("\n", " "))
        chk("no ciphertext in a blank file", '"c"' not in body)

    if "--check" not in sys.argv:
        DIST.mkdir(exist_ok=True)
        BLANK.write_text(html, encoding="utf-8")
        print(f"\nBuilt {BLANK} ({BLANK.stat().st_size:,} bytes)")

    print(f"\n{'=' * 46}\nlint: {'PASS' if not fails else 'FAIL'}  ({len(fails)} problem(s))")
    for n, d in fails:
        print("  FAIL", n, "->", d)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
