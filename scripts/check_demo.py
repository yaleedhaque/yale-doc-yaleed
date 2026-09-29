#!/usr/bin/env python3
"""Prove the committed demo is a real, openable YaleDoc document.

Runs in CI on a clean checkout: if the demo in dist/ ever stops decrypting, or
its documented password drifts from what scripts/make_demo.py writes, this fails.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "dist" / "YaleDoc-Demo.ydoc.html"
BLANK = ROOT / "dist" / "YaleDoc-Blank.ydoc.html"
sys.path.insert(0, str(ROOT / "scripts"))
from make_demo import DEMO_PASSWORD  # noqa: E402

fails = []


def chk(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (("  -> " + detail) if detail else ""))
    if not ok:
        fails.append(name)


def main() -> int:
    chk("blank artefact exists", BLANK.exists())
    chk("demo artefact exists", DEMO.exists())
    if not DEMO.exists():
        return 1

    src = DEMO.read_text(encoding="utf-8")
    chk("demo carries an encrypted payload", '"c"' in src and "A short tour" not in src)
    chk("demo leaks no plaintext", "ciphertext" not in src)
    chk("demo boots locked (every screen hidden)", 'id="app" class="hidden"' in src and 'class="screen hidden"' in src)
    chk("demo has the build nonce", bool(re.search(r"<script nonce=\"[0-9a-f]{8,}\">", src)))

    for exe in ("/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"):
        launch = {"executable_path": exe} if Path(exe).exists() else {}
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, **launch)
            page = b.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.goto("file://" + str(DEMO))
            page.wait_for_selector("#lockScreen:not(.hidden)", timeout=25000)
            chk("demo opens to the lock screen", True)
            page.fill("#lockPw", "wrong-password-entirely")
            page.click("#lockGo")
            page.wait_for_function("()=>document.getElementById('lockErr').textContent.length>0", timeout=30000)
            chk("wrong password is refused", "Wrong password" in (page.text_content("#lockErr") or ""))
            page.fill("#lockPw", DEMO_PASSWORD)
            page.click("#lockGo")
            page.wait_for_selector("#app:not(.hidden)", timeout=60000)
            html = page.inner_html("#ydPages")
            chk("documented password unlocks the demo", "A short tour of YaleDoc" in html, html[:60])
            chk("demo title restored", "A short tour" in (page.input_value("#docTitle") or ""))
            chk("demo table survived", page.evaluate("()=>document.querySelectorAll('#ydPages tbody tr').length") == 4)
            chk("demo bengali text survived", "বাংলা" in html)
            chk("no page errors while opening the demo", not errs, errs[:2])
            b.close()
        break

    print("\n" + "=" * 46)
    print("demo check:", "PASS" if not fails else f"FAIL ({len(fails)})")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
