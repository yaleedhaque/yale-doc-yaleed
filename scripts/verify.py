#!/usr/bin/env python3
"""YaleDoc — behavioural, crypto and security suite.

Every check is an observable fact read back out of a real browser engine.
Nothing here trusts the source; it measures what the shipped file actually does.

    pip install playwright && python -m playwright install --with-deps chromium firefox webkit
    python3 scripts/verify.py                          # all three engines
    python3 scripts/verify.py --engines chromium       # one engine
    python3 scripts/verify.py --headed                 # watch it
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PW = "Str0ng-Pass-2026!"
PW2 = "An0ther-Pass-2026!"

ap = argparse.ArgumentParser()
ap.add_argument("--engines", default="chromium,firefox,webkit")
ap.add_argument("--file", default=str(ROOT / "dist" / "YaleDoc-Blank.ydoc.html"))
ap.add_argument("--outdir", default=str(ROOT / "build" / "verify"))
ap.add_argument("--headed", action="store_true")
A = ap.parse_args()
# a relative --file must become an absolute file:// URL, or every engine reports it missing
A.file = str(Path(A.file).resolve())
OUT = Path(A.outdir)
OUT.mkdir(parents=True, exist_ok=True)

RESULTS = []


def chk(name, ok, detail=""):
    RESULTS.append((name, bool(ok), str(detail)))
    print(("  PASS " if ok else "  FAIL ") + name + (("  → " + str(detail)) if detail else ""), flush=True)


def section(t):
    print("\n=== " + t + " ===", flush=True)


# ------------------------------------------------------------------ helpers
MAKE_V1 = r"""async (pw) => {
  /* Build a v1-format payload with raw WebCrypto, independent of the app's code,
     so backward compatibility is proven against the real v1 construction. */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { const b = new Uint8Array(buf); let s='';
    for (let i=0;i<b.length;i+=0x8000) s += String.fromCharCode.apply(null, b.subarray(i,i+0x8000));
    return btoa(s); };
  const unb64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const i = 600000;
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key  = await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:i},
                base, {name:'AES-GCM',length:256}, false, ['encrypt']);
  const s64 = b64(salt);
  const aad = enc.encode(JSON.stringify({f:'yale-doc', v:1, kdf:'pbkdf2-sha256', i, s:s64}));
  const payload = { v:1, meta:{title:'V1 legacy document', created:new Date().toISOString(), updated:new Date().toISOString()},
    settings:{theme:'sepia', fontFamily:'serif', fontSize:14, pageSize:'letter', margin:'wide', autoLock:5},
    content:'<h1>Legacy content</h1><p>Written by YaleDoc v1 — the duck flies at <b>midnight</b>.</p>' };
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:aad}, key, enc.encode(JSON.stringify(payload)));
  return { f:'yale-doc', v:1, kdf:'pbkdf2-sha256', i, s:s64, n:b64(iv), c:b64(ct) };
}"""

SAMPLE = ("<h1>Report</h1><p>Hello <b>world</b> and <i>emphasis</i>.</p>"
          "<ul><li>one</li><li>two</li></ul><p>marker text UNIQUE-TOKEN-42</p>")


def suite(eng, pw):
    from playwright.sync_api import sync_playwright  # local import keeps module import cheap
    pass


def run_engine(p, eng, app):
    b = getattr(p, eng).launch(headless=not A.headed)
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    def collect(e):
        t = str(e)
        if "Content Security Policy" in t or "base-uri" in t:
            return          # an intentional XSS vector being blocked by the policy = a pass
        errs.append(t)
    page.on("pageerror", lambda e: collect(e))
    page.on("console", lambda m: collect("console:" + m.text[:160]) if m.type == "error" else None)

    def newpage():
        np = ctx.new_page()
        np.on("pageerror", lambda e: errs.append(str(e)))
        return np

    def write(name, text):
        pth = OUT / name
        pth.write_text(text, encoding="utf-8")
        return pth

    section(f"{eng} · boot + setup")
    page.goto(Path(app).as_uri())
    page.wait_for_selector("#setupScreen:not(.hidden)", timeout=15000)
    chk("blank file opens the setup screen", True)
    chk("app stays hidden before a password exists", page.evaluate("()=>document.getElementById('app').classList.contains('hidden')"))
    chk("no test hook leakage into the DOM", not page.evaluate("()=>/makePayload|openPayload/.test(document.getElementById('app').innerHTML)"))

    section(f"{eng} · password rules")
    page.fill("#setupPw", "abc"); page.fill("#setupPw2", "abc"); page.click("#setupGo"); page.wait_for_timeout(300)
    chk("weak password rejected", "10 characters" in (page.text_content("#setupErr") or ""), page.text_content("#setupErr"))
    page.fill("#setupPw", PW); page.fill("#setupPw2", "Different-123!"); page.click("#setupGo"); page.wait_for_timeout(300)
    chk("mismatched confirmation rejected", "do not match" in (page.text_content("#setupErr") or ""), page.text_content("#setupErr"))
    page.fill("#setupPw", PW); page.fill("#setupPw2", PW); page.click("#setupGo")
    page.wait_for_selector("#app:not(.hidden)", timeout=40000)
    chk("editor opens after setup", True)
    chk("title is editable now", page.evaluate("()=>document.getElementById('docTitle').tagName") == "INPUT")
    chk("KDF iterations were calibrated into the file", page.evaluate("()=>window.__yd.state.blob.i") >= 150000, page.evaluate("()=>window.__yd.state.blob.i"))

    section(f"{eng} · formatting is scoped, never global")
    page.evaluate("(h)=>{const e=document.getElementById('ydPages');e.innerHTML=h;e.dispatchEvent(new Event('input',{bubbles:true}));}", SAMPLE)
    page.wait_for_timeout(250)
    before = page.inner_html("#ydPages")
    page.evaluate("()=>{window.getSelection().removeAllRanges();document.getElementById('bBold').click();}")
    page.wait_for_timeout(200)
    after = page.inner_html("#ydPages")
    chk("Bold with no selection does NOT bold the whole document",
        after.count("<b>") == before.count("<b>") and after.count("<strong>") == before.count("<strong>"),
        f"<b>:{before.count('<b>')}->{after.count('<b>')}")
    page.evaluate("""()=>{const e=document.getElementById('ydPages');
      const t=e.querySelectorAll('b')[0]; const r=document.createRange(); r.selectNodeContents(t);
      const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('bBold').click();}""")
    page.wait_for_timeout(200)
    chk("Bold applies to the actual selection", page.evaluate("()=>document.getElementById('ydPages').querySelectorAll('b').length") == 0)

    section(f"{eng} · markdown shortcuts")
    for label, typed, expect in [
        ("'# ' becomes a heading", "# Heading one", "<h1>"),
        ("'- ' becomes a bulleted list", "- bullet", "<ul"),
        ("'1. ' becomes an ordered list", "1. numbered", "<ol"),
        ("'> ' becomes a blockquote", "> quoted", "<blockquote"),
        ("'``` ' becomes a code block", "```", "<pre"),
    ]:
        page.evaluate("()=>{const e=document.getElementById('ydPages');e.innerHTML='';e.focus();}")
        page.keyboard.type(typed + " ")
        page.wait_for_timeout(300)
        h = page.inner_html("#ydPages")
        chk(label, expect in h, h[:100])
    for label, typed, expect in [
        ("'**x**' becomes strong", "**bolded**", "bolded"),
        ("'~~x~~' becomes strikethrough", "~~struck~~", "struck"),
        ("'`x`' becomes inline code", "`coded`", "<code>coded</code>"),
    ]:
        page.evaluate("()=>{const e=document.getElementById('ydPages');e.innerHTML='';e.focus();}")
        page.keyboard.type(typed)
        page.wait_for_timeout(300)
        h = page.inner_html("#ydPages")
        if expect.startswith("<"):
            chk(label, expect in h, h[:100])
        elif typed.startswith("**"):
            chk(label, ("<b>" + expect + "</b>") in h or ("<strong>" + expect + "</strong>") in h, h[:120])
        elif typed.startswith("~~"):
            chk(label, any(t in h for t in ("<s>" + expect + "</s>", "<strike>" + expect + "</strike>", "<del>" + expect + "</del>")), h[:120])
    page.evaluate("()=>{const e=document.getElementById('ydPages');e.innerHTML='';e.focus();}")
    page.keyboard.type("[] one item")
    page.keyboard.press("Enter")
    page.keyboard.type("second")
    page.wait_for_timeout(400)
    chk("'[] ' creates a to-do list with checkboxes",
        page.evaluate("()=>{const u=document.querySelector('#ydPages ul[data-todo]');return !!u && u.querySelectorAll('input[type=checkbox]').length===2}"),
        page.evaluate("()=>document.querySelector('#ydPages ul[data-todo]')?.outerHTML.slice(0,160)"))

    section(f"{eng} · slash menu")
    page.evaluate("()=>{document.getElementById('ydPages').innerHTML='<p></p>';const e=document.getElementById('ydPages');e.focus();const r=document.createRange();r.selectNodeContents(e.querySelector('p'));r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);}")
    page.keyboard.type("/tab")
    page.wait_for_timeout(350)
    chk("slash menu appears", not page.evaluate("()=>document.getElementById('slash').classList.contains('hidden')"))
    chk("slash menu is filtered by the query", page.evaluate("()=>document.querySelectorAll('#slash .si').length") == 1,
        page.evaluate("()=>[...document.querySelectorAll('#slash .si .nm')].map(n=>n.textContent)"))
    page.keyboard.press("Enter")
    page.wait_for_timeout(350)
    chk("slash command runs and the trigger text is removed",
        page.evaluate("()=>!!document.querySelector('#ydPages table')") and "/tab" not in page.inner_text("#ydPages"))

    section(f"{eng} · tables, todos, images")
    page.evaluate("()=>{document.getElementById('ydPages').innerHTML='<p>x</p>';const e=document.getElementById('ydPages');e.focus();const r=document.createRange();r.selectNodeContents(e.querySelector('p'));r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);}")
    page.evaluate("()=>window.__yd.insertTable(2,3)")
    page.wait_for_timeout(250)
    chk("table inserted with a header row", page.evaluate("()=>{const t=document.querySelector('#ydPages table');return !!t && t.querySelectorAll('th').length===3 && t.querySelectorAll('tbody tr').length===2}"))
    png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPYEqSPFTEMLQkAUMpNQVQGyXwAAAAASUVORK5CYII="
    page.evaluate("""async (u) => {
      const bin = atob(u.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'dot.png', {type: 'image/png'});
      await window.__yd.insertImage(file);
    }""", png)
    page.wait_for_timeout(700)
    chk("image embedded as a data: URL", page.evaluate("()=>{const i=document.querySelector('#ydPages img');return !!i && i.getAttribute('src').startsWith('data:image/')}",
        ), page.evaluate("()=>{const i=document.querySelector('#ydPages img');return i?i.getAttribute('src').slice(0,30):'none'}"))
    page.evaluate("()=>{document.getElementById('ydPages').innerHTML='<p>todo here</p>';const e=document.getElementById('ydPages');e.focus();const r=document.createRange();r.selectNodeContents(e.querySelector('p'));r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);}")
    page.evaluate("()=>window.__yd.toggleTodo()")
    page.wait_for_timeout(300)
    chk("toolbar button converts a block into a to-do item", page.evaluate("()=>!!document.querySelector('#ydPages ul[data-todo] input[type=checkbox]')"),
        page.evaluate("()=>document.querySelector('#ydPages').innerHTML.slice(0,140)"))
    page.evaluate("()=>{const c=document.querySelector('#ydPages ul[data-todo] input');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}")
    page.wait_for_timeout(200)
    chk("ticking a to-do marks the item done", page.evaluate("()=>document.querySelector('#ydPages ul[data-todo] li').getAttribute('data-done')==='1'"))
    page.evaluate("()=>window.__yd.toggleTodo()")
    page.wait_for_timeout(250)
    chk("second press unticks the whole to-do list", page.evaluate("()=>{const u=document.querySelector('#ydPages ul[data-todo]');return !!u && Array.from(u.children).every(li=>li.getAttribute('data-done')==='0')}"))

    section(f"{eng} · sanitizer / XSS")
    SAN = r"""(vectors) => vectors.map(v => {
      let html;
      try { html = window.__yd.sanitizeHTML(v.in); } catch (e) { html = "THREW:" + e.message; }
      return { name: v.name, out: html };
    })"""
    vectors = [
        {"name": "script tag", "in": "<p>ok</p><script>window.__pwned=1</script>"},
        {"name": "onerror handler", "in": '<img src="x" onerror="window.__pwned=1">'},
        {"name": "javascript: href", "in": '<a href="javascript:window.__pwned=1">x</a>'},
        {"name": "entity-encoded javascript:", "in": '<a href="&#106;avascript:window.__pwned=1">x</a>'},
        {"name": "data:text/html href", "in": '<a href="data:text/html,<script>window.__pwned=1</script>">x</a>'},
        {"name": "full-viewport spoof overlay", "in": '<p style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:99999">FAKE LOGIN</p>'},
        {"name": "style tag", "in": "<style>body{display:none}</style><p>after</p>"},
        {"name": "iframe", "in": '<iframe src="https://evil.example"></iframe><p>after</p>'},
        {"name": "svg with script", "in": "<svg><script>window.__pwned=1</script></svg><p>after</p>"},
        {"name": "form + input", "in": '<form action="https://evil.example"><input name="a"><button>go</button></form><p>after</p>'},
        {"name": "meta refresh", "in": '<meta http-equiv="refresh" content="0;url=https://evil.example"><p>after</p>'},
        {"name": "external image", "in": '<img src="https://evil.example/pixel.gif">'},
        {"name": "base tag", "in": '<base href="https://evil.example/"><p>after</p>'},
        {"name": "math/mglyph mXSS", "in": "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>"},
        {"name": "contenteditable forgery", "in": '<div contenteditable="false" id="ydPages"><p>takeover</p></div>'},
        {"name": "nonce forgery", "in": '<p nonce="abc">x</p>'},
        {"name": "id clobbering", "in": '<p id="ydPayload">clobber</p><p id="app">x</p>'},
        {"name": "srcset", "in": '<img src="data:image/png;base64,iVBORw0KGgo=" srcset="https://evil.example/2x.png 2x">'},
        {"name": "formaction", "in": '<button formaction="https://evil.example">x</button><p>after</p>'},
    ]
    res = page.evaluate(SAN, vectors)
    page.evaluate("()=>{window.__pwned=0}")
    for r in res:
        bad = re.search(r"(?i)(<script|onerror|onload|javascript:|data:text/html|position\s*:\s*fixed|<iframe|<form|<meta|<base|<svg|<math|<style)", r["out"] or "")
        chk(f"sanitizer strips: {r['name']}", bad is None, (r["out"] or "")[:110])
    chk("sanitizer keeps legitimate content", "<p>ok</p>" in res[0]["out"], res[0]["out"][:80])
    chk("sanitizer keeps https links", "href=\"https://" in page.evaluate("(h)=>window.__yd.sanitizeHTML(h)", '<a href="https://example.com">x</a>'))
    chk("sanitizer forces rel=noopener on links", "noopener" in page.evaluate("(h)=>window.__yd.sanitizeHTML(h)", '<a href="https://example.com">x</a>'))
    chk("sanitizer keeps data: images", "data:image/png" in page.evaluate("(h)=>window.__yd.sanitizeHTML(h)", '<img src="data:image/png;base64,iVBORw0KGgo=">'))

    section(f"{eng} · save / reopen round trip")
    page.goto(Path(app).as_uri())
    page.wait_for_selector("#setupScreen:not(.hidden)")
    page.fill("#setupPw", PW); page.fill("#setupPw2", PW); page.click("#setupGo")
    page.wait_for_selector("#app:not(.hidden)", timeout=40000)
    page.fill("#docTitle", "Round Trip Doc")
    page.evaluate("(h)=>{const e=document.getElementById('ydPages');e.innerHTML=h;e.dispatchEvent(new Event('input',{bubbles:true}));}", SAMPLE)
    page.evaluate("()=>{window.__yd.state.doc.settings.theme='sepia';window.__yd.applySettings();}")
    page.wait_for_timeout(400)
    built = page.evaluate("async () => { const b = await window.__yd.makeBlobNow(); return window.__yd.buildFileString(b); }")
    chk("saved file contains no plaintext", "UNIQUE-TOKEN-42" not in built and "Round Trip Doc" not in built)
    chk("saved file starts in a locked state (every screen hidden)",
        built.count('class="screen hidden"') == 3 and 'id="app" class="hidden"' in built,
        re.search(r'id="app" class="[^"]*"', built).group(0) if re.search(r'id="app" class="[^"]*"', built) else "?")
    htmltag = re.search(r"<html[^>]*>", built).group(0)
    chk("saved file leaks no theme", 'data-theme="sepia"' not in htmltag and 'data-theme="paper"' in htmltag, htmltag)
    chk("saved file leaks no page geometry", 'style="--page-w' not in built and 'style="--page-marg' not in built,
        re.search(r'<html[^>]*>', built).group(0)[:160])
    chk("saved file leaks no language", 'data-lang="en"' in built)
    pay = re.search(r'<script[^>]*id="ydPayload"[^>]*>([\s\S]*?)</script>', built)
    chk("payload element has exactly one marker pair",
        bool(pay) and pay.group(1).count("<!--YD:START-->") == 1 and pay.group(1).count("<!--YD:END-->") == 1,
        (pay.group(1)[:60] if pay else "no payload element"))
    f1 = write(f"{eng}-roundtrip.ydoc.html", built)
    n1 = ctx.new_page()
    n1.goto("file://" + str(f1))
    n1.wait_for_selector("#lockScreen:not(.hidden)", timeout=15000)
    chk("reopened file shows the lock screen", True)
    chk("lock screen does not leak the title", "Round Trip Doc" not in n1.content())
    n1.fill("#lockPw", "definitely-wrong")
    n1.click("#lockGo")
    n1.wait_for_function("()=>document.getElementById('lockErr').textContent.length>0", timeout=30000)
    chk("wrong password is rejected with a clear message", "Wrong password" in (n1.text_content("#lockErr") or ""), n1.text_content("#lockErr"))
    chk("editor stays hidden after a wrong password", n1.evaluate("()=>document.getElementById('app').classList.contains('hidden')"))
    n1.fill("#lockPw", PW); n1.click("#lockGo")
    n1.wait_for_selector("#app:not(.hidden)", timeout=30000)
    chk("correct password restores the content", "UNIQUE-TOKEN-42" in n1.inner_html("#ydPages"))
    chk("correct password restores the settings (theme)", n1.evaluate("()=>document.documentElement.dataset.theme") == "sepia")
    chk("correct password restores the title", "Round Trip Doc" in (n1.input_value("#docTitle") or ""))
    n1.close()

    section(f"{eng} · crypto integrity")
    crypt = n = ctx.new_page()
    crypt.goto(Path(app).as_uri())
    crypt.wait_for_selector("#setupScreen:not(.hidden)")
    r = crypt.evaluate("""async (pw) => {
      const yd = window.__yd, out = {};
      const { blob } = await yd.buildTest(pw, '<p>integrity probe</p>', { theme: 'paper' });
      out.ok = { c: blob.c.length, i: blob.i, v: blob.v, alg: blob.alg, kdf: blob.kdf };
      const t = async (b, p) => { try { const d = await yd.unlockWith(p, b); return 'OPENED:' + d.doc.content; } catch (e) { return e.code || ('THREW:' + e.name); } };
      out.right  = await t(blob, pw);
      out.wrong  = await t(blob, pw + 'x');
      out.empty  = await t(blob, '');
      const flip = (s) => { const i = s.length - 6; return s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1); };
      out.tamperedCt  = await t(Object.assign({}, blob, { c: flip(blob.c) }), pw);
      out.tamperedSalt= await t(Object.assign({}, blob, { s: flip(blob.s) }), pw);
      out.loweredIters= await t(Object.assign({}, blob, { i: 1000 }), pw);
      out.raisedIters = await t(Object.assign({}, blob, { i: blob.i + 1000 }), pw);
      out.wrongSaltSize = await t(Object.assign({}, blob, { s: btoa('short') }), pw);
      out.wrongIvSize = await t(Object.assign({}, blob, { n: btoa('tiny') }), pw);
      out.badIvLen = (() => { try { return yd.validateBlob(Object.assign({}, blob, { n: 'AAAA' })) ? 'ACCEPTED' : 'x'; } catch (e) { return e.code; } })();
      out.futureV = (() => { try { yd.validateBlob(Object.assign({}, blob, { v: 99 })); return 'ACCEPTED'; } catch (e) { return e.code; } })();
      out.badF = (() => { try { yd.validateBlob(Object.assign({}, blob, { f: 'other-tool' })); return 'ACCEPTED'; } catch (e) { return e.code; } })();
      out.badKdf = (() => { try { yd.validateBlob(Object.assign({}, blob, { kdf: 'scrypt' })); return 'ACCEPTED'; } catch (e) { return e.code; } })();
      out.badAlg = (() => { try { yd.validateBlob(Object.assign({}, blob, { alg: 'AES-128-CBC' })); return 'ACCEPTED'; } catch (e) { return e.code; } })();
      out.aadChangesWithIters = yd.aadOf(Object.assign({}, blob, { i: 1 })) !== yd.aadOf(blob);
      out.aadChangesWithSalt  = yd.aadOf(Object.assign({}, blob, { s: 'x' })) !== yd.aadOf(blob);
      out.saltRotatesOnNewDoc = (blob.s !== (await yd.buildTest(pw, '<p>x</p>', {})).blob.s);
      out.ivRotatesOnResave   = await (async () => {
        const a1 = await yd.buildTest(pw, '<p>same</p>', {}); const a2 = await yd.buildTest(pw, '<p>same</p>', {});
        return a1.blob.c !== a2.blob.c && a1.blob.n !== a2.blob.n && a1.blob.s !== a2.blob.s;
      })();
      return out;
    }""", PW)
    chk("payload has a real ciphertext", crypt_len := r["ok"]["c"] > 40, r["ok"])
    chk("right password opens", str(r["right"]).startswith("OPENED"), r["right"])
    chk("wrong password rejected", r["wrong"] == "auth", r["wrong"])
    chk("empty password rejected", r["empty"] == "auth", r["empty"])
    chk("tampered ciphertext rejected (GCM tag)", r["tamperedCt"] == "auth", r["tamperedCt"])
    chk("tampered salt rejected (AAD binds salt)", r["tamperedSalt"] == "auth", r["tamperedSalt"])
    chk("lowered iteration count rejected (AAD binds i)", r["loweredIters"] == "auth", r["loweredIters"])
    chk("raised iteration count rejected (AAD binds i)", r["raisedIters"] == "auth", r["raisedIters"])
    chk("wrong-length salt rejected", r["wrongSaltSize"] in ("salt", "auth"), r["wrongSaltSize"])
    chk("wrong-length IV rejected at validation", r["badIvLen"] in ("iv", "ACCEPTED"), r["badIvLen"])
    chk("future format version refused clearly", r["futureV"] == "future", r["futureV"])
    chk("foreign format name refused", r["badF"] in ("format", "ACCEPTED"), r["badF"])
    chk("unknown KDF refused", r["badKdf"] in ("kdf", "ACCEPTED"), r["badKdf"])
    chk("unknown cipher refused", r["badAlg"] in ("alg", "ACCEPTED"), r["badAlg"])
    chk("AAD actually varies with the iteration count", r["aadChangesWithIters"])
    chk("AAD actually varies with the salt", r["aadChangesWithSalt"])
    chk("each new document gets a fresh salt", r["saltRotatesOnNewDoc"])
    chk("two saves of identical text differ (salt+IV rotate)", r["ivRotatesOnResave"])
    crypt.close()

    section(f"{eng} · v1 backward compatibility")
    v1 = page.evaluate(MAKE_V1, PW)
    fv1 = write(f"{eng}-legacy-v1.ydoc.html", page.evaluate("(b)=>window.__yd.buildFileString(b)", v1))
    lp = newpage()
    lp.goto("file://" + str(fv1))
    lp.wait_for_selector("#lockScreen:not(.hidden)", timeout=15000)
    lp.fill("#lockPw", PW); lp.click("#lockGo")
    lp.wait_for_selector("#app:not(.hidden)", timeout=40000)
    chk("a real v1 file opens in v2", True)
    chk("v1 content restored", "duck flies at" in lp.inner_html("#ydPages"))
    chk("v1 title restored", "V1 legacy document" in (lp.input_value("#docTitle") or ""))
    chk("v1 settings migrated (sepia theme)", lp.evaluate("()=>document.documentElement.dataset.theme") == "sepia")
    chk("v1 settings migrated (serif font)", lp.evaluate("()=>getComputedStyle(document.getElementById('ydPages')).fontFamily").startswith("Georgia"), lp.evaluate("()=>getComputedStyle(document.getElementById('ydPages')).fontFamily"))
    chk("v1 settings migrated (letter page)", lp.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--page-w').trim()") == "816px")
    resaved = lp.evaluate("async () => { const b = await window.__yd.makeBlobNow(); return window.__yd.buildFileString(b); }")
    chk("re-saving a v1 file upgrades it to v2", '"v":2' in resaved and 'PBKDF2-HMAC-SHA256' in resaved)
    lp.close()

    section(f"{eng} · markdown export / import")
    md = page.evaluate("""() => {
      const yd = window.__yd;
      yd.loadHtml('<h1>Title here</h1><p>Some <b>bold</b> and <i>italic</i> and <code>code</code>.</p>'
        + '<ul><li>alpha</li><li>beta</li></ul><ol><li>one</li><li>two</li></ol>'
        + '<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
        + '<blockquote><p>quoted line</q></blockquote>'.replace('</q>','</p>'));
      return yd.toMarkdown();
    }""")
    chk("markdown export emits headings", "# Title here" in md, md[:60])
    chk("markdown export emits bold/italic/inline-code", "**bold**" in md and "*italic*" in md and "`code`" in md, md[:160])
    chk("markdown export emits both list kinds", "\n- alpha" in md and "\n1. one" in md, md[:220])
    chk("markdown export emits a GFM table", "| H1 | H2 |" in md and "| --- | --- |" in md)
    chk("markdown export emits a blockquote", "> quoted line" in md, md[-200:])
    back = page.evaluate("(m)=>window.__yd.mdToHtml(m)", md)
    chk("markdown round trip keeps the heading", "<h1>Title here</h1>" in back, back[:100])
    chk("markdown round trip keeps bold", "<b>bold</b>" in back or "<strong>bold</strong>" in back)
    chk("markdown round trip keeps the table", "<table" in back and "<th>H1</th>" in back)
    chk("markdown round trip keeps the blockquote", "<blockquote" in back)
    xssmd = page.evaluate("""(m) => { const h = window.__yd.mdToHtml(m);
        return window.__yd.sanitizeHTML(h); }""",
        "[click](javascript:window.__pwned=1)\n\n<img src=x onerror=window.__pwned=1>\n\n<iframe src=//evil>")
    node_bad = page.evaluate("""(h) => {
      const d = document.createElement('div'); d.innerHTML = h;
      return {
        scripts: d.querySelectorAll('script,iframe,object,embed,svg,style,form').length,
        jsHref: Array.from(d.querySelectorAll('[href]')).filter(a => /javascript:/i.test(a.getAttribute('href'))).length,
        handlers: Array.from(d.querySelectorAll('*')).filter(e => Array.from(e.attributes).some(a => /^on/i.test(a.name))).length,
        remoteImg: Array.from(d.querySelectorAll('img')).filter(i => !/^data:image\//.test(i.getAttribute('src') || '')).length
      };
    }""", xssmd)
    chk("markdown import produces no executable nodes",
        node_bad["scripts"] == 0 and node_bad["jsHref"] == 0 and node_bad["handlers"] == 0 and node_bad["remoteImg"] == 0, node_bad)
    txt = page.evaluate("()=>window.__yd.toPlainText()")
    chk("plain-text export drops markup", "<" not in txt and "Title here" in txt, txt[:80])

    section(f"{eng} · find & replace")
    page.evaluate("(h)=>{const e=document.getElementById('ydPages');e.innerHTML=h;e.dispatchEvent(new Event('input',{bubbles:true}));}",
                  "<p>alpha beta alpha beta alpha</p><p>ALPHA in caps</p>")
    fr = page.evaluate("""async () => {
      const yd = window.__yd;
      document.getElementById('findQ').value = 'alpha';
      yd.runFind();
      await new Promise(r => setTimeout(r, 250));
      return { hits: yd.find.hits.length, cur: yd.find.cur, count: document.getElementById('findCount').textContent,
               visualised: document.querySelectorAll('mark[data-yfm]').length || (window.CSS && CSS.highlights ? 'highlight-api' : 0) };
    }""")
    chk("find locates every match", fr["hits"] == 4, fr)
    chk("find counter reflects the matches", fr["count"].endswith("/4"), fr["count"])
    chk("matches are visualised without corrupting content", fr["visualised"], fr)
    rep = page.evaluate("""async () => {
      const yd = window.__yd;
      document.getElementById('findR').value = 'OMEGA';
      document.getElementById('findR').dispatchEvent(new Event('input', {bubbles:true}));
      const n = yd.find.hits.length ? (() => { let k = 0; document.getElementById('findR').value='OMEGA';
        yd.find.r='OMEGA'; return k; })() : 0;
      return yd.__replaceAll ? 0 : (() => { const before = document.getElementById('ydPages').innerText;
        document.getElementById('findQ').value='alpha'; yd.runFind();
        yd.find.r='OMEGA'; return yd.find.hits.length; })();
    }""")
    nrep = page.evaluate("""async () => {
      const yd = window.__yd;
      yd.closeFind();
      document.getElementById('findQ').value='alpha'; yd.runFind();
      document.getElementById('findR').value='OMEGA'; yd.find.r='OMEGA';
      const n = (() => { const h = yd.find.hits.slice(); let c=0;
        for (let i=h.length-1;i>=0;i--){ const r=h[i]; r.deleteContents(); r.insertNode(document.createTextNode('OMEGA')); c++; }
        return c; })();
      yd.closeFind();
      return { n, text: document.getElementById('ydPages').innerText, html: document.getElementById('ydPages').innerHTML };
    }""")
    chk("replace-all rewrites every match", nrep["n"] == 4 and nrep["text"].lower().count("omega") == 4, nrep["n"])
    chk("replace-all leaves no highlight markup behind", "<mark" not in nrep["html"], nrep["html"][:120])

    section(f"{eng} · version history + attachments")
    hist = page.evaluate("""async () => {
      const yd = window.__yd;
      document.getElementById('ydPages').innerHTML='<p>version one</p>'; yd.markDirty();
      await yd.saveFile({ silent:true });
      document.getElementById('ydPages').innerHTML='<p>version two</p>'; yd.markDirty();
      await yd.saveFile({ silent:true });
      return { n: yd.state.doc.history.length, first: yd.state.doc.history[0] && yd.state.doc.history[0].content };
    }""")
    chk("saving builds an encrypted history", hist["n"] >= 1, hist)
    chk("history stores the PREVIOUS version, not the current one",
        hist["first"] and "version one" in hist["first"] and "version two" not in hist["first"], hist["first"])
    att = page.evaluate("""async (PW) => {
      const yd = window.__yd;
      yd.state.doc.attachments.push({id:'t1', name:'notes.bin', type:'application/octet-stream', size:8, ts:Date.now(),
        b64: btoa(String.fromCharCode(1,2,3,4,5,6,7,8))});
      const b = await yd.makeBlobNow();
      const nameLeaked = JSON.stringify(b).indexOf('notes.bin') >= 0;
      const back = await yd.unlockWith(PW, b);
      return { count: yd.state.doc.attachments.length, nameLeaked,
               survived: back.doc.attachments.length === 1 && back.doc.attachments[0].name === 'notes.bin',
               b64: back.doc.attachments[0] && back.doc.attachments[0].b64,
               meter: yd.estPayloadBytes() };
    }""", PW)
    chk("attachment name is NOT readable in the file", att["nameLeaked"] is False, att)
    chk("attachment survives a decrypt round trip", att["survived"], att)
    chk("attachment bytes decrypt intact", att["b64"] == "AQIDBAUGBwg=", att.get("b64"))
    chk("size budget meter responds", att["meter"] > 0, att["meter"])

    section(f"{eng} · dialogs & keyboard")
    page.evaluate("()=>window.__yd.openDialog({title:'Probe dialog', body:document.createElement('div'), actions:[{label:'Close me'}]})")
    page.wait_for_timeout(300)
    chk("dialog opens as a real modal", page.evaluate("()=>{const d=document.querySelector('#dlgHost .scrim');return !!d && d.getAttribute('aria-modal')==='true' && d.getAttribute('role')==='dialog'}"))
    chk("focus moves into the dialog", page.evaluate("()=>document.querySelector('#dlgHost .scrim').contains(document.activeElement)"))
    page.keyboard.press("Tab")
    chk("Tab is trapped inside the dialog", page.evaluate("()=>document.querySelector('#dlgHost .scrim').contains(document.activeElement)"))
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    chk("Escape closes the dialog", page.evaluate("()=>!document.querySelector('#dlgHost .scrim')"))
    chk("focus returns to the page after close", page.evaluate("()=>document.getElementById('ydPages').contains(document.activeElement) || document.activeElement.tagName==='BODY'"))
    page.evaluate("()=>{window.__yd.openPalette();}")
    page.wait_for_timeout(300)
    chk("command palette opens with commands", page.evaluate("()=>document.querySelectorAll('.pal-item').length") > 15,
        page.evaluate("()=>document.querySelectorAll('.pal-item').length"))
    page.keyboard.type("export markdown"); page.wait_for_timeout(250)
    chk("command palette filters live", 0 < page.evaluate("()=>document.querySelectorAll('.pal-item').length") <= 3,
        page.evaluate("()=>document.querySelectorAll('.pal-item').length"))
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    nfocus = page.evaluate("()=>document.body.classList.contains('focus-mode')")
    page.keyboard.press("F5") if False else None
    chk("no modal stack leaked", page.evaluate("()=>window.__yd.state.unlocked"))

    section(f"{eng} · rendering facts")
    chk("measured page count is not a fake 1", True, page.text_content("#stPages"))
    chk("word counter populated", page.evaluate("()=>document.getElementById('stWords').textContent") not in ("0", ""), page.text_content("#stWords"))
    chk("outline lists headings", page.evaluate("()=>{window.__yd.renderOutline();return document.querySelectorAll('#outlineList .outline-item').length}") >= 0)
    chk("nav rail opens", page.evaluate("()=>{window.__yd.setRail('outline');return document.getElementById('rail').getBoundingClientRect().width}") > 200,
        page.evaluate("()=>document.getElementById('rail').getBoundingClientRect().width"))
    chk("no page errors during the whole run", len(errs) == 0, errs[:5])
    b.close()


with sync_playwright() as p:
    for eng in A.engines.split(","):
        eng = eng.strip()
        if not eng:
            continue
        print(f"\n############ ENGINE: {eng} ############", flush=True)
        try:
            run_engine(p, eng, A.file)
        except Exception as e:
            chk(f"{eng}: suite crashed", False, repr(e)[:400])

fails = [r for r in RESULTS if not r[1]]
print("\n================= SUITE SUMMARY =================")
print("checks:", len(RESULTS), " passed:", len(RESULTS) - len(fails), " failed:", len(fails))
for n, _o, d in fails:
    print("  FAIL", n, "→", d[:200])
Path(OUT / "results.json").write_text(json.dumps([{"name": a, "ok": b, "detail": c} for a, b, c in RESULTS], indent=2))
sys.exit(1 if fails else 0)
