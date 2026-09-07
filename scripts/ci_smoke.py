#!/usr/bin/env python3
"""CI smoke test (headless, no system Chrome needed).

Runs in GitHub Actions using Playwright's bundled Chromium. Proves the core
YaleDoc promise end-to-end without a headed browser:
  1. A blank app.html boots to the setup screen.
  2. A document can be encrypted (AES-256-GCM) into a .ydoc.html string.
  3. The payload survives the file round-trip (build -> extract).
  4. Wrong password is rejected; right password unlocks the same content.

Exits non-zero on any failure. Fast (~10-15s).
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "source" / "app.html"
PW = "ci-password-2026"
check_count = 0


def ok(name: str, cond: bool):
    global check_count
    check_count += 1
    status = "PASS" if cond else "FAIL"
    print(f"{status} {name}")
    if not cond:
        raise AssertionError(f"check failed: {name}")


def _launch(p):
    """Prefer a real stable Chrome if present (faster, WebCrypto), else bundled."""
    for exe in ("/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"):
        if Path(exe).exists():
            return p.chromium.launch(headless=True, executable_path=exe)
    return p.chromium.launch(headless=True)


def main() -> int:
    with sync_playwright() as p:
        browser = _launch(p)
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto("file://" + str(APP))
        page.wait_for_selector("#setupScreen:not(.hidden)")

        ok("boots-to-setup", True)

        # full UI flow: create a fresh document with the password
        page.fill("#setupPw", PW)
        page.fill("#setupPw2", PW)
        page.click("#setupGo")
        page.wait_for_selector("#app:not(.hidden)")
        ok("editor-opens-after-setup", True)

        # crypto round-trip via __yd hooks
        built = page.evaluate(
            """(pw) => (async () => {
              const R = window.__yd;
              const docObj = {
                v:1,
                meta:{title:"CI doc", created:new Date().toISOString(), updated:new Date().toISOString()},
                settings:{theme:"sepia", fontFamily:"serif", fontSize:13, pageSize:"a4", margin:"normal", autoLock:10},
                content:"<h1>CI Round Trip</h1><p>secret content</p>"
              };
              const payload = await R.makePayload(pw, docObj);
              return { built: R.buildFileString(payload), ct: payload.c.length };
            })()""",
            PW,
        )
        ok("encrypt-produces-ciphertext", built["ct"] > 40)
        ok("doc-contains-no-plaintext", "secret content" not in built["built"])

        # extract payload from the serialized file and decrypt
        result = page.evaluate(
            """(arg) => (async () => {
              const R = window.__yd;
              const payload = R.getPayloadFromSource(arg.built);
              if (!payload) return { status: "no-payload" };
              let wrong = null;
              try { await R.openPayload("bad-password", payload); wrong = "did-not-throw"; }
              catch (e) { wrong = "rejected:" + e.name; }
              let good = null;
              try { const doc = await R.openPayload(arg.pw, payload); good = doc.content; }
              catch (e) { good = "threw:" + e.message; }
              return { status: "ok", c: payload.c.length, wrong, good };
            })()""",
            {"built": built["built"], "pw": PW},
        )
        ok("payload-extracted-from-file", result["status"] == "ok" and result["c"] > 40)
        ok("wrong-pw-rejected", "rejected" in str(result["wrong"]))
        ok("right-pw-unlocks-same-content", "secret content" in str(result["good"]))

        ok("no-page-errors", len(errors) == 0)
        browser.close()
    print(f"\nci_smoke: {check_count} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())