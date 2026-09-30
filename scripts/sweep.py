#!/usr/bin/env python3
"""Click-everything sweep.

Opens a document, then clicks EVERY interactive control in the app on every
engine, asserting after each one that the page is still alive and the document
text is intact.

This exists because of a bug the behavioural suite missed: a bare `close()` in a
dialog resolved to the global `window.close()`. Firefox honours it and tears the
document down - losing the user's work - while Chromium and WebKit silently
ignore it. Only a test that actually clicks things on every engine catches that.

    python3 scripts/sweep.py
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PW = "Str0ng-Pass-2026!"
SAMPLE = ("<h1>Report</h1><p>Important paragraph I must not lose.</p>"
          "<ul><li>alpha</li></ul><table><thead><tr><th>H</th></tr></thead>"
          "<tbody><tr><td>c</td></tr></tbody></table>")

# These open a NATIVE file chooser, which blocks the headless browser process and
# poisons every later control. They are covered separately by the behavioural
# suite, which drives the file input directly.
SKIPPED = [("cmd Open", "#bOpen"), ("cmd Image", "#bImg")]

CONTROLS = [
    # (label, selector, setup JS run before clicking)
    ("topbar rail toggle", "#railBtn", None),
    ("topbar find", "#findBtn", None),
    ("topbar reading mode", "#readBtn", None),
    ("topbar lock", "#lockBtn", None),
    ("cmd New", "#bNew", None),
    ("cmd Save", "#bSave", None),
    ("cmd Save copy", "#bSaveCopy", None),
    ("cmd Print", "#bPrint", None),
    ("cmd Undo", "#bUndo", None),
    ("cmd Redo", "#bRedo", None),
    ("cmd Bold", "#bBold", None),
    ("cmd Italic", "#bItalic", None),
    ("cmd Underline", "#bUnder", None),
    ("cmd Strikethrough", "#bStrike", None),
    ("cmd Sup", "#bSup", None),
    ("cmd Sub", "#bSub", None),
    ("cmd Paragraph", "#bP", None),
    ("cmd H1", "#bH1", None),
    ("cmd H2", "#bH2", None),
    ("cmd H3", "#bH3", None),
    ("cmd Quote", "#bQuote", None),
    ("cmd Code block", "#bCode", None),
    ("cmd Bulleted", "#bUl", None),
    ("cmd Numbered", "#bOl", None),
    ("cmd To-do", "#bTodo", None),
    ("cmd Table picker", "#bTable", "OPEN_TABLE_PICKER"),
    ("cmd Align left", "#bAl", None),
    ("cmd Align centre", "#bAc", None),
    ("cmd Align right", "#bAr", None),
    ("cmd Justify", "#bAj", None),
    ("cmd Indent", "#bInd", None),
    ("cmd Outdent", "#bOutd", None),
    ("cmd Link", "#bLink", None),
    ("cmd Colour", "#bColor", None),
    ("cmd Highlight", "#bHl", None),
    ("cmd Rule", "#bHr", None),
    ("cmd Page break", "#bPageBreak", None),
    ("cmd Clear format", "#bClear", None),
    ("cmd Commands", "#bCmd", None),
    ("cmd Settings rail", "#bRailSettings", None),
    ("rail tab Outline", '.rail-tab[data-pane="outline"]', "OPEN_RAIL"),
    ("rail tab History", '.rail-tab[data-pane="history"]', "OPEN_RAIL"),
    ("rail tab Files", '.rail-tab[data-pane="files"]', "OPEN_RAIL"),
    ("rail tab Look", '.rail-tab[data-pane="settings"]', "OPEN_RAIL"),
    ("rail snapshot", "#snapNow", "OPEN_RAIL_HISTORY"),
    ("dialog action: table Insert", "#dlgHost .scrim .btn.primary", "OPEN_TABLE_PICKER"),
    ("dialog action: table Cancel", "#dlgHost .scrim .btn:not(.primary)", "OPEN_TABLE_PICKER"),
    ("dialog close X", "#dlgHost .scrim .dlg-h .x", "OPEN_DIALOG"),
    ("palette item", ".pal-item", "OPEN_PALETTE"),
    ("find next", "#findNext", "OPEN_FIND"),
    ("find close", "#findClose", "OPEN_FIND"),
]

SETUP = {
    "OPEN_RAIL": "() => window.__yd.setRail('settings')",
    "OPEN_RAIL_HISTORY": "() => window.__yd.setRail('history')",
    "OPEN_DIALOG": "() => window.__yd.openDialog({title:'sweep', body:document.createElement('div'), actions:[{label:'Go'}]})",
    "OPEN_TABLE_PICKER": ("() => { document.getElementById('ydPages').focus(); window.__yd.tablePicker(); }"),
    "OPEN_PALETTE": "() => window.__yd.openPalette()",
    "OPEN_FIND": "() => { document.getElementById('findQ').value='a'; window.__yd.runFind(); document.getElementById('findbar').classList.remove('hidden'); }",
}

ap = argparse.ArgumentParser()
ap.add_argument("--file", default=str(ROOT / "dist" / "YaleDoc-Blank.ydoc.html"))
ap.add_argument("--engines", default="chromium,firefox,webkit")
ARGS = ap.parse_args()
APP = str(Path(ARGS.file).resolve())

results = []


def main() -> int:
    for eng in ARGS.engines.split(","):
        eng = eng.strip()
        if not eng:
            continue
        with sync_playwright() as p:
            b = getattr(p, eng).launch(headless=True)
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
            page = ctx.new_page()
            page.on("dialog", lambda d: d.dismiss())
            first = True
            for label, sel, setup in CONTROLS:
                try:
                    # a clean load per control: no state can bleed between them.
                    # Slower than an in-place reset, but it is the only way to be sure a
                    # control is not merely hidden by the previous one.
                    page.goto("file://" + APP)
                    page.wait_for_selector("#setupScreen:not(.hidden)", timeout=20000)
                    page.fill("#setupPw", PW); page.fill("#setupPw2", PW); page.click("#setupGo")
                    page.wait_for_selector("#app:not(.hidden)", timeout=45000)
                    page.evaluate("(h)=>{const e=document.getElementById('ydPages');e.innerHTML=h;e.dispatchEvent(new Event('input',{bubbles:true}));}", SAMPLE)
                    page.evaluate("()=>{const ed=document.getElementById('ydPages');ed.focus();const r=document.createRange();r.selectNodeContents(ed.querySelector('p'));r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);}")
                    if setup:
                        page.evaluate(SETUP[setup])
                        page.wait_for_timeout(350)
                        if setup == "OPEN_TABLE_PICKER":
                            cells = page.query_selector_all("#tblPick i")
                            if cells:
                                cells[16].hover()
                                page.wait_for_timeout(120)
                    page.click(sel, timeout=5000, force=True)
                    page.wait_for_timeout(450)
                    alive = page.evaluate("()=>!!document.getElementById('ydPages')")
                    text = page.evaluate("()=>document.getElementById('ydPages').innerText") if alive else ""
                    ok = bool(alive and "Important paragraph" in text)
                    detail = "" if ok else ("document was torn down" if not alive else f"text={text[:40]!r}")
                    results.append((eng, label, ok, detail))
                except Exception as e:
                    results.append((eng, label, False, str(e).split("\n")[0][:70]))
            try:
                ctx.close()
            except Exception:
                pass
            try:
                b.close()
            except Exception:
                pass

    fails = [r for r in results if not r[2]]
    for eng, label, ok, detail in results:
        if not ok:
            print(f"  FAIL {eng:9} {label:28} -> {detail}")
    print("\n================= SWEEP SUMMARY =================")
    print("clicked:", len(results), " passed:", len(results) - len(fails), " failed:", len(fails))
    print("skipped (native file chooser blocks headless):", ", ".join(n for n, _ in SKIPPED))
    Path(ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "build" / "sweep.json").write_text(json.dumps(
        [{"engine": a, "control": b_, "ok": c, "detail": d} for a, b_, c, d in results], indent=2))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
