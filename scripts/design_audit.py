#!/usr/bin/env python3
"""Design + accessibility audit.

Reads computed styles, real boxes and contrast ratios out of a live engine across
four viewports, four device pixel ratios and all three themes. A screenshot is
context, not a spec - this is the spec.

    python3 scripts/design_audit.py
    python3 scripts/design_audit.py --engine firefox
"""
import argparse
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
_ap = argparse.ArgumentParser(add_help=True)
_ap.add_argument("file", nargs="?", default=str(ROOT / "dist" / "YaleDoc-Blank.ydoc.html"))
_ap.add_argument("--engine", default="chromium", help="chromium | firefox | webkit")
ARGS = _ap.parse_args()
APP = str(Path(ARGS.file).resolve())
PW = "Str0ng-Pass-2026!"
_P = ("A document format should outlive the application that writes it, and a good editor should "
      "feel like a sheet of paper rather than a control panel. Every decision here follows from one "
      "constraint: the file is the program, so there is no runtime to install, no server to reach, "
      "and no plaintext allowed to touch the disk at any point in the pipeline. ")
SAMPLE = (
    "<h1>The Architecture of Small Software</h1>"
    "<p>Good tools disappear. The best ones are <strong>unremarkable</strong> until the moment "
    "you need them, and then they are the only thing that matters.</p>"
    "<blockquote><p>A document format should outlive the application that writes it.</p></blockquote>"
    "<h2>1. Constraints first</h2><p>" + _P * 3 + "</p>"
    "<ul><li>Encryption is the default, never a toggle.</li>"
    "<li>Every save re-randomises the initialisation vector.</li>"
    "<li>No plaintext ever reaches the filesystem.</li></ul>"
    "<h2>2. The table is the thing</h2>"
    '<p>See <a href="https://example.com">the reference</a> and '
    '<a href="https://example.com/2">another link</a>.</p><p>' + _P * 3 + "</p>"
    "<table><thead><tr><th>Layer</th><th>Choice</th></tr></thead><tbody>"
    "<tr><td>Cipher</td><td>AES-256-GCM</td></tr><tr><td>KDF</td><td>PBKDF2-SHA-256</td></tr>"
    "</tbody></table><p>" + _P * 2 + "</p>")

MEASURE = r"""() => {
  const px = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0;
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    return {w:+r.width.toFixed(1),h:+r.height.toFixed(1),x:+r.x.toFixed(1),y:+r.y.toFixed(1),
            bg:c.backgroundColor,color:c.color,fs:c.fontSize,fw:c.fontWeight,ff:c.fontFamily.split(',')[0].replace(/"/g,''),
            radius:c.borderRadius,pad:c.padding,border:c.borderColor, shadow: c.boxShadow !== 'none'}; };
  const body = document.body;
  return {
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    docW: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    parts: {
      topbar: box('#topbar'), cmdbar: box('#cmdbar'), canvas: box('#canvas'),
      page: box('#ydPages'), status: box('#statusbar'), rail: box('#rail'),
      title: box('#docTitle'), guides: box('#guides'),
    },
    guideCount: document.querySelectorAll('#guides .guide').length,
    statusPages: document.getElementById('stPages').textContent,
    statusWords: document.getElementById('stWords').textContent,
    cmdOverflow: (() => { const b = document.getElementById('cmdbar');
      const kids=[...b.children].map(c=>c.getBoundingClientRect());
      const minT=Math.min(...kids.map(r=>r.top)), maxB=Math.max(...kids.map(r=>r.bottom));
      return { singleRow: (maxB-minT) <= b.clientHeight + 2, scrollsX: b.scrollWidth > b.clientWidth + 1,
               clientH: b.clientHeight, extent: +(maxB-minT).toFixed(1), scrollW: b.scrollWidth, clientW: b.clientWidth }; })(),
    railTabs: [...document.querySelectorAll('.rail-tab')].map(t => {
      const r = t.getBoundingClientRect(); return {label:t.textContent.trim(), w:+r.width.toFixed(1), h:+r.height.toFixed(1)}; }),
    toolbarButtons: [...document.querySelectorAll('#cmdbar button')].map(t => {
      const r = t.getBoundingClientRect(); const c = getComputedStyle(t);
      return {id:t.id, w:+r.width.toFixed(1), h:+r.height.toFixed(1), name:(t.getAttribute('aria-label')||t.textContent||'').trim().slice(0,24)}; }),
    noAccessibleName: [...document.querySelectorAll('button,a[href],input,select,textarea')].filter(el => {
      const r = el.getBoundingClientRect(); if (r.width === 0) return false;
      const n = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
      return !n; }).map(el => el.id || el.tagName),
    emojiIcons: (document.getElementById('app').innerText + document.getElementById('lockScreen').innerText).match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [],
    fontFamiliesUsed: [...new Set([...document.querySelectorAll('body,#ydPages,#topbar,button')].map(e => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g,'')))],
    docTypography: (() => { const h1 = document.querySelector('#ydPages h1'), p = document.querySelector('#ydPages p');
      return { h1: h1 ? {fs:getComputedStyle(h1).fontSize, fw:getComputedStyle(h1).fontWeight, lh:getComputedStyle(h1).lineHeight} : null,
               p: p ? {fs:getComputedStyle(p).fontSize, lh:getComputedStyle(p).lineHeight} : null }; })(),
    pageFit: (() => { const p = document.getElementById('ydPages');
      return {w:+p.getBoundingClientRect().width.toFixed(1), pad:getComputedStyle(p).padding}; })(),
  };
}"""

CONTRAST = r"""() => {
  function parse(c){ const m = String(c).match(/[\d.]+/g); if(!m) return null;
    return {r:+m[0],g:+m[1],b:+m[2],a:m.length>3?+m[3]:1}; }
  function over(fg,bg){ return {r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a), b:fg.b*fg.a+bg.b*(1-fg.a), a:1}; }
  function lum(c){ const f=[c.r,c.g,c.b].map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]; }
  function ratio(a,b){ const la=lum(a), lb=lum(b); const hi=Math.max(la,lb), lo=Math.min(la,lb); return +((hi+0.05)/(lo+0.05)).toFixed(2); }
  /* composite every translucent background down to the first opaque ancestor */
  function bgOf(el){
    const stack=[]; let e=el;
    while(e){ const c=parse(getComputedStyle(e).backgroundColor);
      if(c && c.a>0){ stack.push(c); if(c.a>=1) break; } e=e.parentElement; }
    let base = stack.length && stack[stack.length-1].a>=1 ? stack.pop() : {r:255,g:255,b:255,a:1};
    for(let i=stack.length-1;i>=0;i--) base = over(stack[i], base);
    return base; }
  const out=[];
  const push=(name,sel)=>{ const e=document.querySelector(sel); if(!e) return;
    if(!e.getBoundingClientRect().width) { out.push({name, ratio:99, fs:getComputedStyle(e).fontSize, fw:getComputedStyle(e).fontWeight, hidden:true}); return; }
    const c=getComputedStyle(e); out.push({name, ratio: ratio(parse(c.color), bgOf(e)), fs:c.fontSize, fw:c.fontWeight}); };
  push('body text','#topbar .brand'); push('doc body text','#ydPages p');
  push('doc h1','#ydPages h1'); push('doc quote','#ydPages blockquote p');
  push('muted/status','#statusbar'); push('hint text','.hint');
  push('sub-hint','#setupNote'); push('strength hint','#setupStrengthNote');
  push('link','#ydPages a'); push('toolbar icon','#cmdbar #bImg');
  push('topbar icon','#topbar #railBtn .ico');
  push('guide label','#guides .guide span');
  push('page text','#ydPages');
  /* The pressed state of a toggle cannot be measured reliably: syncToolbar() flips
     aria-pressed on selectionchange and .iconbtn transitions colour/background, so a
     live read can land mid-transition. Compute it from the design tokens instead. */
  const cs2 = getComputedStyle(document.documentElement);
  const acc = parse(cs2.getPropertyValue('--accent').trim());
  const accInk = parse(cs2.getPropertyValue('--accent-ink').trim());
  if (acc && accInk) {
    const rs = getComputedStyle(document.querySelector('#cmdbar #bImg') || document.body);
    out.push({name:'pressed toggle (token pair)', ratio: ratio(acc, accInk), fs:rs.fontSize, fw:rs.fontWeight,
              fg: cs2.getPropertyValue('--accent-ink').trim(), bg: cs2.getPropertyValue('--accent').trim()});
  }
  return out.filter(r => !r.hidden);
}"""

fails, notes = [], []


def chk(name, ok, detail=""):
    (notes if ok else fails).append((name, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  → " + str(detail) if detail else ""))


with sync_playwright() as p:
    b = getattr(p, ARGS.engine).launch(headless=True)
    print(f"engine: {ARGS.engine}")

    for label, vp, dsf, mobile in [("desktop 1440x900", {"width": 1440, "height": 900}, 1, False),
                                   ("laptop 1280x800", {"width": 1280, "height": 800}, 1.25, False),
                                   ("tablet 834x1112", {"width": 834, "height": 1112}, 2, False),
                                   ("mobile 390x844", {"width": 390, "height": 844}, 3, True)]:
        ctx = b.new_context(viewport=vp, device_scale_factor=dsf, is_mobile=mobile, has_touch=mobile)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(Path(APP).resolve().as_uri())
        page.wait_for_selector("#setupScreen:not(.hidden)")
        page.fill("#setupPw", PW); page.fill("#setupPw2", PW); page.click("#setupGo")
        page.wait_for_selector("#app:not(.hidden)", timeout=40000)
        page.evaluate("(h)=>{const e=document.getElementById('ydPages');e.innerHTML=h;e.dispatchEvent(new Event('input',{bubbles:true}));}", SAMPLE)
        # Re-measure on every poll and wait for a real multi-page result. A fixed
        # sleep races the engine's layout pass: on a slow runner the first read can
        # land before the blocks have height, which would assert a bogus "1 page".
        page.wait_for_function("""() => {
          try { window.__yd.drawGuides(); } catch (e) {}
          const g = document.querySelectorAll('#guides .guide').length;
          const p = parseInt(document.getElementById('stPages').textContent || '1', 10);
          return p >= 2 && g === p - 1;
        }""", timeout=30000, polling=150)
        page.wait_for_timeout(250)
        m = page.evaluate(MEASURE)
        print(f"\n===== {label} (dpr {m['dpr']}) =====")
        chk(f"{label}: no horizontal overflow", not m["overflowX"], f"scrollWidth={m['docW']} vw={m['vw']}")
        chk(f"{label}: no page errors", len(errs) == 0, errs[:2])
        co = m["cmdOverflow"]
        chk(f"{label}: command bar stays one row", co["singleRow"], f"extent={co['extent']}px clientH={co['clientH']}px (scrollX={co['scrollsX']} w={co['scrollW']}/{co['clientW']})")
        pt = m["parts"]
        chk(f"{label}: top bar height sane", 40 <= pt["topbar"]["h"] <= 60, f"{pt['topbar']['h']}px")
        chk(f"{label}: status bar visible", pt["status"]["h"] >= 24, f"{pt['status']['h']}px")
        chk(f"{label}: page width fits canvas", pt["page"]["w"] <= m["vw"] + 1, f"page={pt['page']['w']} vw={m['vw']}")
        chk(f"{label}: page has shadow + radius", pt["page"]["shadow"] and pt["page"]["radius"] != "0px", f"shadow={pt['page']['shadow']} radius={pt['page']['radius']}")
        small = [t for t in m["toolbarButtons"] if t["h"] < (32 if mobile else 26) or t["w"] < 24]
        chk(f"{label}: toolbar targets >= {32 if mobile else 26}px", not small, small[:4])
        chk(f"{label}: every control has an accessible name", not m["noAccessibleName"], m["noAccessibleName"][:6])
        chk(f"{label}: no emoji used as icons", not m["emojiIcons"], m["emojiIcons"][:6])
        pages = int(str(m["statusPages"]).replace(",", "") or 1)
        chk(f"{label}: page count is measured, not fixed", pages >= 2, f"{pages} pages")
        chk(f"{label}: one guide per page boundary", m["guideCount"] == max(0, pages - 1),
            f"{m['guideCount']} guides for {pages} pages")
        # Toolbar buttons take their pressed colour from the current selection, so
        # measuring with a live selection makes this check state-dependent. Clear it.
        page.evaluate("() => { try { getSelection().removeAllRanges(); } catch (e) {} }")
        page.wait_for_timeout(400)   # let the .iconbtn colour transition settle
        c = page.evaluate(CONTRAST)
        worst = sorted(c, key=lambda r: r["ratio"])[:3]
        bad = [r for r in c if r["ratio"] < 4.5]
        chk(f"{label}: text contrast >= 4.5:1", not bad,
            [(r["name"], r["ratio"], r["fs"], r.get("fg"), r.get("bg")) for r in bad][:4])
        print("   contrast:", ", ".join(f"{r['name']}={r['ratio']}" for r in c))
        if label.startswith("desktop"):
            chk("doc h1 is large + bold", float(m["docTypography"]["h1"]["fs"][:-2]) >= 22 and int(m["docTypography"]["h1"]["fw"]) >= 600, m["docTypography"]["h1"])
            chk("doc body readable", 14 <= float(m["docTypography"]["p"]["fs"][:-2]) <= 20, m["docTypography"]["p"])
            pv = m["pageFit"]["pad"].split()
            chk("page padding is a real document margin", all(float(v.replace('px','')) >= 40 for v in pv[:2]), m["pageFit"]["pad"])
            page.evaluate("() => window.__yd.setRail('settings')"); page.wait_for_timeout(400)
            rail = page.evaluate(MEASURE)
            ws = [t["w"] for t in rail["railTabs"]]
            chk("rail tabs equal width (rail open)", max(ws) - min(ws) < 3 and min(ws) > 40, ws)
            chk("rail is visible when open", rail["parts"]["rail"]["w"] > 200, rail["parts"]["rail"]["w"])
            c2 = page.evaluate(CONTRAST)
            bad2 = [r for r in c2 if r["ratio"] < 4.5]
            chk("rail open: contrast >= 4.5:1", not bad2, [(r["name"], r["ratio"]) for r in bad2][:4])
            page.evaluate("() => window.__yd.setRail('none')"); page.wait_for_timeout(300)
        if mobile:
            chk(f"{label}: rail hidden until asked", m["parts"]["rail"]["w"] == 0, m["parts"]["rail"]["w"])
            chk(f"{label}: status bar not cramped", m["parts"]["status"]["h"] >= 24, m["parts"]["status"]["h"])
        ctx.close()

    # themes
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(Path(APP).resolve().as_uri())
    page.wait_for_selector("#setupScreen:not(.hidden)")
    page.fill("#setupPw", PW); page.fill("#setupPw2", PW); page.click("#setupGo")
    page.wait_for_selector("#app:not(.hidden)", timeout=40000)
    page.evaluate("(h)=>{const e=document.getElementById('ydPages');e.innerHTML=h;e.dispatchEvent(new Event('input',{bubbles:true}));}", SAMPLE)
    print("\n===== themes =====")
    for th in ["paper", "ink", "sepia", "contrast"]:
        page.evaluate("(t)=>{window.__yd.state.doc.settings.theme=t;window.__yd.applySettings();}", th)
        page.wait_for_timeout(250)
        page.evaluate("() => { try { getSelection().removeAllRanges(); } catch (e) {} }")
        page.wait_for_timeout(400)
        c = page.evaluate(CONTRAST)
        bad = [r for r in c if r["ratio"] < 4.5]
        cs = page.evaluate("()=>({scheme:getComputedStyle(document.documentElement).colorScheme, body:getComputedStyle(document.body).backgroundColor, ink:getComputedStyle(document.body).color})")
        chk(f"theme {th}: contrast >= 4.5:1", not bad, [(r["name"], r["ratio"]) for r in bad][:3])
        chk(f"theme {th}: color-scheme declared", cs["scheme"] in ("light", "dark"), cs["scheme"])
        weak = [r for r in c if r["ratio"] < 7.0]
        chk(f"theme {th}: all measured text >= 7:1 (AAA)", not weak,
            [(r["name"], r["ratio"], r.get("fg"), r.get("bg")) for r in weak][:4])
    # reduced motion
    ctx2 = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    p2 = ctx2.new_page(); p2.goto("file://" + APP); p2.wait_for_timeout(500)
    dur = p2.evaluate("()=>{const s=getComputedStyle(document.querySelector('#topbar .iconbtn')||document.body);return s.transitionDuration}")
    chk("prefers-reduced-motion kills transitions", dur in ("0s", "0.001s") or float(dur.replace("s","").split(",")[0]) < 0.01, dur)
    b.close()

print("\n===== SUMMARY =====")
print("passed:", len(notes), " failed:", len(fails))
for n, d in fails:
    print("  FAIL", n, "→", d)
sys.exit(1 if fails else 0)
