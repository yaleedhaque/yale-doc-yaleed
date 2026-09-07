#!/usr/bin/env python3
"""YaleDoc end-to-end verification (headed).
1. Build a real encrypted .ydoc.html from the page (via __yd hooks).
2. Reopen it -> lock screen. Wrong pw rejected. Right pw restores editor.
"""
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = "/mnt/windows_d/OpenCode Projects/Development/yale-doc/source/app.html"
SCR = "/mnt/windows_d/OpenCode Projects/Screenshots"
PW = "demo1234"

results = []
def ok(name, val=True):
    results.append((name, val))
    print(("PASS " if val else "FAIL ") + name)

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/google-chrome-stable",
        headless=False,
        args=["--use-gl=angle", "--use-angle=swiftshader"],
    )
    ctx = browser.new_context(accept_downloads=True, viewport={"width":1280,"height":820})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # ---- phase 1: build + write a real .ydoc.html ----
    page.goto("file://" + APP)
    page.wait_for_selector("#setupScreen:not(.hidden)", timeout=5000)
    ok("setup-screen-shows-on-blank", True)

    built = page.evaluate("""async () => {
      const R = window.__yd;
      await new Promise(r => setTimeout(r, 60));
      const docObj = {v:1,
        meta:{title:"My First YaleDoc", created:new Date().toISOString(), updated:new Date().toISOString()},
        settings:{theme:"sepia", fontFamily:"serif", fontSize:13, pageSize:"a4", margin:"normal", autoLock:10},
        content:"<h1>Welcome to YaleDoc</h1><p>This <b>entire document</b> is encrypted with AES-256-GCM and lives inside one HTML file.</p><blockquote>It opens on any device &mdash; even offline.</blockquote><p>Secret line: the duck flies at midnight.</p>"};
      const payload = await R.makePayload(JSON.parse('"' + 'demo1234' + '"'), docObj);
      const file = R.buildFileString(payload);
      return file;
    }""")
    ok("built-file-size<200KB", len(built) < 200000)

    demo = Path("/mnt/windows_d/OpenCode Projects/Development/yale-doc/dist/YaleDoc-Demo.ydoc.html")
    demo.write_text(built, encoding="utf-8")
    ok("written-demo-y-doc-html", demo.exists() and demo.stat().st_size > 40000)

    # ---- phase 2: reopen -> lock screen ----
    page.goto("file://" + str(demo))
    page.wait_for_selector("#lockScreen:not(.hidden)", timeout=5000)
    ok("lock-screen-shows-after-reopen", True)
    page.screenshot(path=f"{SCR}/yale-doc-lock-screen.png")

    # eye toggle reveals/hides password
    page.fill("#lockPw", PW)
    page.click(".pw-eye[data-eyes=lockPw]")
    ok("eye-reveals-password", page.get_attribute("#lockPw", "type") == "text")
    ok("eye-keeps-value", page.input_value("#lockPw") == PW)
    page.click(".pw-eye[data-eyes=lockPw]")
    ok("eye-re-hides-password", page.get_attribute("#lockPw", "type") == "password")
    page.fill("#lockPw", "")
    # wrong password
    page.fill("#lockPw", "wrong-password")
    page.click("#lockGo")
    page.wait_for_selector("#lockErr:not(:empty)", timeout=12000)  # 600k PBKDF2 ~ real time
    err = page.text_content("#lockErr")
    ok("wrong-pw-rejected-with-error", "Wrong password" in (err or ""))
    still_locked = page.query_selector("#app.hidden") is not None
    ok("app-stays-locked-on-wrong-pw", still_locked)

    # correct password
    page.fill("#lockPw", PW)
    page.click("#lockGo")
    page.wait_for_selector("#app:not(.hidden)", timeout=15000)
    content = page.evaluate("document.getElementById('ydPages').innerHTML")
    ok("correct-pw-restores-content", "duck flies at midnight" in content)
    ok("correct-pw-restores-h1", "<h1>Welcome to YaleDoc</h1>" in content)
    title = page.text_content("#docTitle")
    ok("doc-title-from-encrypted-meta", "My First YaleDoc" in (title or ""))
    theme = page.evaluate("document.documentElement.dataset.theme")
    ok("sepia-theme-restored", theme == "sepia")
    wordcount = page.text_content("#stWords")
    ok("status-word-count-populated", "word" in (wordcount or ""))
    page.screenshot(path=f"{SCR}/yale-doc-editor-open.png")

    # ---- phase 3: editing + new save reflects content ----
    page.evaluate("""() => {
      const ed = document.getElementById('ydPages');
      const p = document.createElement('p'); p.textContent = 'Extra paragraph added on reopen.';
      ed.appendChild(p);
    }""")
    rebuilt = page.evaluate("""async () => {
      const R = window.__yd;
      const payload = await R.makePayload(JSON.parse('"' + 'demo1234' + '"'),
        {v:1, meta:R.state.doc.meta, settings:R.state.doc.settings, content:R.currentHtml()});
      return R.buildFileString(payload);
    }""")
    # content must ONLY live encrypted: no plaintext in the DOM, but decryptable
    ok("resave-hides-plaintext-from-file", "Extra paragraph added on reopen" not in rebuilt)
    dec = page.evaluate("""(file) => (async () => {
      const R = window.__yd;
      const p = R.getPayloadFromSource(file);
      const d = await R.openPayload(JSON.parse('"' + 'demo1234' + '"'), p);
      return d.content;
    })()""", rebuilt)
    ok("resave-includes-edit-after-decrypt", "Extra paragraph added on reopen" in (dec or ""))

    browser.close()

fails = [n for n, v in results if not v]
print("\n===== SUMMARY =====")
print("passed:", len(results) - len(fails), " failed:", len(fails))
print("pageerrors:", errors[:5])
sys.exit(1 if fails else 0)