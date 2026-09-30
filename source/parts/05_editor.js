/* ==========================================================================
   YaleDoc v2 — editor engine
   ========================================================================== */

function currentContent() {
  normalizeFormatting(editor());
  return sanitizeHTML(editor().innerHTML);
}
function loadHtml(html) {
  const el = editor();
  el.innerHTML = sanitizeHTML(html || "");
  normalizeFormatting(el);
  el.setAttribute("data-empty", el.textContent === "" && !el.querySelector("img,hr,table") ? "true" : "false");
  updateStatus();
}
function focusNode(el) {
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  } catch (e) { }
}
function focusEditorAtEnd() {
  const el = editor(); el.focus();
  const s = getSelection();
  if (!s.rangeCount || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) {
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  }
}
function preserveSelection(fn) {
  const s = getSelection();
  const snap = (s.rangeCount && editor().contains(s.anchorNode)) ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
  try { fn(); } catch (e) { }
  if (snap) { const g = getSelection(); try { g.setBaseAndExtent(snap[0], snap[1], snap[2], snap[3]); } catch (e) { } }
}
function afterCommand() {
  preserveSelection(() => normalizeFormatting(editor()));
  updateStatus(); markDirty(); noteActivity(); syncToolbar();
}
function exec(cmd, val) {
  focusEditorAtEnd();
  try { document.execCommand(cmd, false, val === undefined ? null : val); } catch (e) { }
  afterCommand();
}
function noteActivity() {
  state.lastActivity = Date.now();
  const al = state.doc && state.doc.settings.autolock;
  if (al > 0) state.autolockAt = Date.now() + al * 60000;
}

/* ---------------------------------------------------------------- toolbar state */
const STATE_CMDS = { bBold: "bold", bItalic: "italic", bUnder: "underline", bStrike: "strikeThrough" };
function caretBlock() {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let n = s.anchorNode;
  if (!n) return null;
  if (n.nodeType === 3) n = n.parentElement;
  if (!n || !editor().contains(n)) return null;
  const ed = editor();
  if (n === ed) return null;
  const b = n.closest("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th");
  return (b && b !== ed) ? b : (n.closest ? (n.closest("div") || n) : n);
}
function qState(cmd) { try { return document.queryCommandState(cmd); } catch (e) { return false; } }
function syncToolbar() {
  if (!state.unlocked) return;
  for (const id in STATE_CMDS) $(id).setAttribute("aria-pressed", String(!!qState(STATE_CMDS[id])));
  $("bSup").setAttribute("aria-pressed", String(!!qState("superscript")));
  $("bSub").setAttribute("aria-pressed", String(!!qState("subscript")));
  $("bUl").setAttribute("aria-pressed", String(!!qState("insertUnorderedList")));
  $("bOl").setAttribute("aria-pressed", String(!!qState("insertOrderedList")));
  const b = caretBlock();
  const tag = b ? b.tagName.toLowerCase() : "";
  [["bH1", "h1"], ["bH2", "h2"], ["bH3", "h3"], ["bP", "p"], ["bQuote", "blockquote"], ["bCode", "pre"]].forEach(([id, t]) => $(id).setAttribute("aria-pressed", String(tag === t)));
  if (b) {
    const cls = b.className || "";
    $("bAc").setAttribute("aria-pressed", String(/yalign-center/.test(cls) || b.style.textAlign === "center"));
    $("bAr").setAttribute("aria-pressed", String(/yalign-right/.test(cls) || b.style.textAlign === "right"));
    $("bAj").setAttribute("aria-pressed", String(/yalign-justify/.test(cls)));
    $("bAl").setAttribute("aria-pressed", String(!/yalign-(center|right|justify)/.test(cls) && b.style.textAlign !== "center" && b.style.textAlign !== "right" && b.style.textAlign !== "justify"));
  }
}

/* ---------------------------------------------------------------- block formatting */
function blockFmt(tag) {
  const b = caretBlock();
  const cur = b ? b.tagName.toLowerCase() : "p";
  if (tag === "p" || tag === "blockquote" || tag === "pre") {
    if (cur === tag) { exec("formatBlock", "<p>"); return; }
    if (tag === "pre" && cur !== "pre") {
      /* code block keeps its content but becomes monospace */
      focusEditorAtEnd();
      try { document.execCommand("formatBlock", false, "<pre>"); } catch (e) { }
      afterCommand(); return;
    }
    exec("formatBlock", "<" + tag + ">");
    return;
  }
  exec("formatBlock", "<" + tag + ">");
}
function applyAlign(mode) {
  const b = caretBlock();
  if (!b) { exec("justify" + mode[0].toUpperCase() + mode.slice(1)); return; }
  const cls = " " + (b.className || "");
  for (const c of ["yalign-center", "yalign-right", "yalign-justify"]) b.classList.remove(c);
  if (mode !== "left") b.classList.add("yalign-" + mode);
  afterCommand();
}
function setIndent(dir) {
  const b = caretBlock();
  if (!b) return;
  const m = /yind-([123])/.exec(b.className || "");
  const cur = m ? Number(m[1]) : 0;
  const next = clamp(cur + dir, 0, 3);
  if (m) b.classList.remove(m[0]);
  if (next > 0) b.classList.add("yind-" + next);
  afterCommand();
}

/* ---------------------------------------------------------------- link / color / highlight */
async function linkDialog() {
  const s = getSelection();
  const inLink = s.rangeCount && s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode).closest && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode).closest("a");
  const selText = s.toString();
  const body = mk("div");
  const label = mk("input", { class: "inp", type: "text", placeholder: "https://example.com", value: inLink ? inLink.getAttribute("href") : (safeHref(selText) || ""), spellcheck: "false" });
  const txt = mk("input", { class: "inp", type: "text", value: selText || (inLink ? inLink.textContent : ""), placeholder: "Text to display" });
  body.appendChild(mk("div", { class: "field" }, [mk("label", { for: "lnkUrl", text: LANG === "bn" ? "লিংক" : "Link address" }), label]));
  body.appendChild(mk("div", { class: "field" }, [mk("label", { for: "lnkTxt", text: LANG === "bn" ? "লেখা" : "Text" }), txt]));
  body.appendChild(mk("p", { class: "note", text: LANG === "bn" ? "শুধু https://, mailto:, tel: বা #সংযোগ গ্রহণ করা হয়। javascript: লিংক কখনো কাজ করবে না।" : "Only https://, mailto:, tel: and in-page #anchors are kept. javascript: links are always removed." }));
  openDialog({
    title: inLink ? (LANG === "bn" ? "লিংক সম্পাদনা" : "Edit link") : (LANG === "bn" ? "লিংক যোগ করুন" : "Insert link"),
    cls: "narrow", body,
    actions: [
      inLink ? { label: LANG === "bn" ? "লিংক সরান" : "Remove link", kind: "danger", onClick: c => { if (inLink) { const a = inLink; const r = document.createRange(); r.selectNodeContents(a); const g = getSelection(); g.removeAllRanges(); g.addRange(r); try { document.execCommand("unlink", false, null); } catch (e) { } afterCommand(); } c(); } } : null,
      { label: LANG === "bn" ? "বাতিল" : "Cancel" },
      {
        label: LANG === "bn" ? "যোগ করুন" : "Apply", kind: "primary", onClick: c => {
          const u = safeHref(label.value);
          if (!u) { toast(LANG === "bn" ? "এই লিংকটি গ্রহণ করা হবে না" : "That link address is not allowed", "err"); return; }
          const text = txt.value.trim() || u;
          if (inLink) { inLink.setAttribute("href", u); inLink.textContent = text; }
          else {
            focusEditorAtEnd();
            if (selText) { document.execCommand("createLink", false, u); }
            else { document.execCommand("insertHTML", false, linkHtml(u, text)); }
            preserveSelection(() => { const a = Array.prototype.slice.call(editor().querySelectorAll("a[href='" + u.replace(/'/g, "\\'") + "']")).pop(); if (a) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer nofollow"); } });
          }
          afterCommand(); c();
        }
      },
    ].filter(Boolean),
  });
}
function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function linkHtml(href, text) {
  return '<a href="' + escHtml(href) + '" target="_blank" rel="noopener noreferrer nofollow">' + escHtml(text) + '</a>';
}
function swatchDialog(kind) {
  const isColor = kind === "color";
  const table = isColor ? PALETTE : HLPAL;
  const clsPrefix = isColor ? "ycolor-" : "yhl-";
  const body = mk("div");
  const wrap = mk("div", { class: "swatches" });
  const strip = mk("button", {
    class: "sw", type: "button", style: "background:var(--surface-2);border-style:dashed", title: LANG === "bn" ? "সরান" : "Remove",
    "aria-label": LANG === "bn" ? "ফরম্যাট সরান" : "Remove formatting", onclick: () => { stripFormat(clsPrefix); d.close(); }
  }, icon("eraser", "ico-14"));
  for (const k in table) {
    const b = mk("button", { class: "sw " + (isColor ? k.toLowerCase() : ""), type: "button", style: isColor ? "" : "background:" + table[k], title: isColor ? k.toUpperCase() : k, "aria-label": (isColor ? LANG === "bn" ? "লেখার রং " : "Text colour " : LANG === "bn" ? "হাইলাইট " : "Highlight ") + (isColor ? k.toUpperCase() : k) });
    b.addEventListener("click", () => { applySwatch(clsPrefix + k); d.close(); });
    wrap.appendChild(b);
  }
  wrap.appendChild(strip);
  body.appendChild(mk("p", { class: "lede", style: "margin:0 0 10px", text: isColor ? (LANG === "bn" ? "আপনার লেখার রং বেছে নিন।" : "Pick a colour for your text.") : (LANG === "bn" ? "একটি রঙ বেছে নিয়ে হাইলাইট করুন।" : "Pick a colour to highlight with.") }));
  body.appendChild(wrap);
  const d = openDialog({ title: isColor ? (LANG === "bn" ? "লেখার রং" : "Text colour") : (LANG === "bn" ? "হাইলাইট" : "Highlight"), cls: "narrow", body, actions: [{ label: LANG === "bn" ? "বন্ধ" : "Close" }] });
}
function applySwatch(cls) {
  const s = getSelection();
  if (s.rangeCount && s.isCollapsed) {
    const b = caretBlock();
    if (b) { stripYClasses(b, cls); b.classList.add(cls); afterCommand(); }
    return;
  }
  focusEditorAtEnd();
  try {
    document.execCommand("styleWithCSS", false, true);
    if (cls.startsWith("ycolor")) document.execCommand("foreColor", false, PALETTE[cls.slice(-1)]);
    else document.execCommand("hiliteColor", false, HLPAL[cls.slice(-1)]);
  } catch (e) { }
  afterCommand();
}
function stripFormat(clsPrefix) {
  const apply = (el) => { for (const c of Array.prototype.slice.call(el.classList)) if (c.indexOf(clsPrefix) === 0) el.classList.remove(c); };
  const s = getSelection();
  if (s.rangeCount && !s.isCollapsed && s.getRangeAt(0).cloneContents) {
    const frag = s.getRangeAt(0).cloneContents();
    const host = mk("div", {}, [frag]);
    host.querySelectorAll("*").forEach(el => apply(el));
    focusEditorAtEnd();
    try { document.execCommand("insertHTML", false, host.innerHTML); } catch (e) { }
    afterCommand(); return;
  }
  const b = caretBlock();
  if (b) { apply(b); afterCommand(); return; }
  try { document.execCommand("removeFormat", false, null); } catch (e) { }
  afterCommand();
}
function stripYClasses(el, only) {
  for (const c of Array.prototype.slice.call(el.classList)) {
    if (!only) { if (/^y(align|ind|color|hl)-/.test(c)) el.classList.remove(c); }
    else if (c === only) el.classList.remove(c);
  }
}

/* ---------------------------------------------------------------- table */
function insertTable(rows, cols) {
  focusEditorAtEnd();
  const cell = "<td><br></td>";
  const head = "<th><br></th>";
  let html = "<table><thead><tr>" + head.repeat(cols) + "</tr></thead><tbody>";
  for (let r = 0; r < rows; r++) html += "<tr>" + cell.repeat(cols) + "</tr>";
  html += "</tbody></table><p><br></p>";
  try { document.execCommand("insertHTML", false, html); } catch (e) { return; }
  afterCommand();
  const t = editor().querySelector("table");
  if (t) { const c = t.querySelector("td,th"); if (c) focusNode(c); }
}
function tablePicker() {
  const MAX_R = 8, MAX_C = 10, DEF_R = 3, DEF_C = 3;
  let r = DEF_R, c = DEF_C;              /* never zero: Insert always inserts */
  const wrap = mk("div");
  const grid = mk("div", { id: "tblPick", role: "grid", "aria-label": "Table size" });
  const label = mk("div", { id: "tblLabel", role: "status", "aria-live": "polite" });
  const cells = [];
  const rows = [];
  for (let y = 0; y < MAX_R; y++) {
    const row = [];
    for (let x = 0; x < MAX_C; x++) {
      const i = mk("button", {
        type: "button", class: "cell", role: "gridcell", "data-r": String(y + 1), "data-c": String(x + 1),
        tabindex: "-1", "aria-label": (y + 1) + " rows by " + (x + 1) + " columns",
      });
      i.addEventListener("click", (ev) => { ev.preventDefault(); set(y + 1, x + 1); });
      i.addEventListener("pointerenter", () => set(y + 1, x + 1));
      i.addEventListener("pointerdown", () => set(y + 1, x + 1));
      i.addEventListener("keydown", (ev) => {
        const k = ev.key, dy = k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : 0;
        const dx = k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0;
        if (!dy && !dx) return;
        ev.preventDefault();
        const ny = clamp(y + 1 + dy, 1, MAX_R), nx = clamp(x + 1 + dx, 1, MAX_C);
        set(ny, nx, true);
      });
      cells.push(i); row.push(i); grid.appendChild(i);
    }
    rows.push(row);
  }
  function set(nr, nc, focus) {
    r = clamp(nr, 1, MAX_R); c = clamp(nc, 1, MAX_C);
    for (const x of cells) {
      const on = Number(x.dataset.r) <= r && Number(x.dataset.c) <= c;
      x.classList.toggle("on", on);
      x.setAttribute("aria-selected", String(Number(x.dataset.r) === r && Number(x.dataset.c) === c));
    }
    label.textContent = r + " × " + c + (LANG === "bn" ? " টেবিল" : " table");
    if (focus) { const t = rows[r - 1][c - 1]; t.tabIndex = 0; cells.forEach(x => { if (x !== t) x.tabIndex = -1; }); t.focus(); }
  }
  const first = rows[0][0]; first.tabIndex = 0;
  set(DEF_R, DEF_C);
  wrap.appendChild(grid);
  wrap.appendChild(label);
  wrap.appendChild(mk("p", { class: "hint", style: "margin-top:8px",
    text: LANG === "bn" ? "আঙুলে ট্যাপ করুন বা তীরচিহ্ন চাপুন।" : "Tap a cell, or use the arrow keys. Enter accepts the current size." }));
  openDialog({
    title: LANG === "bn" ? "টেবিল ঢোকান" : "Insert table", cls: "narrow", body: wrap,
    actions: [
      { label: LANG === "bn" ? "বাতিল" : "Cancel" },
      { label: LANG === "bn" ? "ঢোকান" : "Insert", kind: "primary", onClick: (cl) => { insertTable(r, c); cl(); } },
    ],
    onOpen: () => { first.focus(); },
  });
}
function caretTable() { const b = caretBlock(); return b ? b.closest("table") : null; }
function caretImage() {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let n = s.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
  const el = n && n.nodeType === 1 ? (n.tagName === "IMG" ? n : (n.closest ? n.closest("img") : null)) : null;
  return el && editor().contains(el) ? el : null;
}

/* floating context pill for the table / image under the caret */
const pill = { el: null, kind: null, target: null };
function initPill() {
  pill.el = mk("div", {
    class: "row", style: "position:fixed;z-index:60;gap:2px;padding:4px;background:var(--ink);border-radius:var(--r-md);box-shadow:var(--shadow-3);opacity:0;pointer-events:none;transition:opacity var(--dur-2)"
  });
  document.body.appendChild(pill.el);
}
function updatePill() {
  if (!pill.el || !state.unlocked) return;
  const t = caretTable(), im = caretImage();
  const target = t ? { kind: "table", el: t } : im ? { kind: "image", el: im } : null;
  if (!target) { pill.el.style.opacity = "0"; pill.el.style.pointerEvents = "none"; pill.target = null; return; }
  if (pill.target !== target.el) { pill.target = target.el; pill.kind = target.kind; pill.el.textContent = ""; buildPill(); }
  const r = target.el.getBoundingClientRect();
  const x = clamp(r.right - pill.el.offsetWidth - 6, 8, window.innerWidth - pill.el.offsetWidth - 8);
  const y = Math.max(8, r.top - pill.el.offsetHeight - 8);
  pill.el.style.left = x + "px"; pill.el.style.top = y + "px";
  pill.el.style.opacity = "1"; pill.el.style.pointerEvents = "auto";
}
function pillBtn(iconId, title, fn) {
  return mk("button", { class: "iconbtn sm", type: "button", title: title, "aria-label": title, style: "color:var(--bg)", onclick: (e) => { e.preventDefault(); fn(); } }, icon(iconId, "ico-20"));
}
function buildPill() {
  const b = pill.el;
  if (pill.kind === "table") {
    const t = pill.target;
    b.appendChild(pillBtn("plus", LANG === "bn" ? "সারি যোগ" : "Add row", () => { const rows = t.tBodies[0].rows; if (rows.length) { const nr = rows[rows.length - 1].cloneNode(true); nr.innerHTML = Array.from(nr.cells).map(() => "<br>").join(""); rows[rows.length - 1].after(nr); } afterCommand(); }));
    b.appendChild(pillBtn("plus", LANG === "bn" ? "কলাম যোগ" : "Add column", () => { Array.from(t.rows).forEach(tr => { const isHead = tr.parentElement && tr.parentElement.tagName === "THEAD"; tr.appendChild(mkCell(isHead ? "th" : "td")); }); afterCommand(); }));
    b.appendChild(pillBtn("minus", LANG === "bn" ? "শেষ সারি মুছুন" : "Delete last row", () => { const rows = t.tBodies[0].rows; if (rows.length > 1) rows[rows.length - 1].remove(); afterCommand(); }));
    b.appendChild(pillBtn("minus", LANG === "bn" ? "শেষ কলাম মুছুন" : "Delete last column", () => { if (t.rows[0].cells.length > 1) Array.from(t.rows).forEach(tr => tr.lastElementChild.remove()); afterCommand(); }));
    b.appendChild(pillBtn("type", LANG === "bn" ? "হেডার সারি বদল" : "Toggle header row", () => { const th = t.querySelector("thead tr"); if (th) { const tb = t.tBodies[0]; if (tb.rows.length) { tb.rows[0].before(th); } else { th.remove(); } } else { const first = t.rows[0]; const thead = mk("thead", {}, mk("tr", {}, Array.from(first.cells).map(c => { const h = mk("th", {}); h.innerHTML = c.innerHTML; return h; }))); t.insertBefore(thead, t.firstChild); } afterCommand(); }));
    b.appendChild(pillBtn("trash", LANG === "bn" ? "টেবিল মুছুন" : "Delete table", () => { t.remove(); afterCommand(); }));
  } else {
    const im = pill.target;
    b.appendChild(pillBtn("al", LANG === "bn" ? "বামে" : "Align left", () => { im.removeAttribute("data-align"); afterCommand(); }));
    b.appendChild(pillBtn("ac", LANG === "bn" ? "মাঝখানে" : "Centre", () => { im.setAttribute("data-align", "center"); afterCommand(); }));
    b.appendChild(pillBtn("ar", LANG === "bn" ? "ডানে" : "Align right", () => { im.setAttribute("data-align", "right"); afterCommand(); }));
    b.appendChild(pillBtn("doc", LANG === "bn" ? "ক্যাপশন যোগ" : "Add caption", () => {
      const fig = mk("figure", {}, []); const cap = mk("figcaption", { contenteditable: "true", "data-caption": "1", text: LANG === "bn" ? "ক্যাপশন" : "Caption" });
      const f2 = mk("figure"); f2.appendChild(im); f2.appendChild(cap);
      const cs = getComputedStyle(im); if (cs.display) f2.style.margin = "0";
      im.replaceWith(f2); afterCommand(); focusNode(cap);
    }));
    b.appendChild(pillBtn("trash", LANG === "bn" ? "ছবি মুছুন" : "Delete image", () => { const f = im.closest("figure"); (f || im).remove(); afterCommand(); }));
  }
}
function mkCell(tag) { const c = document.createElement(tag); c.innerHTML = "<br>"; return c; }

/* ---------------------------------------------------------------- images */
function readImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("decode")); im.src = String(fr.result); };
    fr.onerror = () => rej(new Error("read"));
    fr.readAsDataURL(file);
  });
}
async function insertImage(file) {
  if (!state.unlocked) { toast(t("toast.needDoc"), "err"); return; }
  if (!file || !/^image\//.test(file.type || "")) { toast(t("toast.imgBad"), "err"); return; }
  if (file.size > FMT.maxImageBytes) { toast(t("toast.imgBig"), "err"); return; }
  const done = busyOn(LANG === "bn" ? "ছবি যোগ করা হচ্ছে…" : "Embedding image…", "", true);
  try {
    const im = await readImage(file);
    const MAX = 1600;
    const scale = Math.min(1, MAX / Math.max(im.width || 1, im.height || 1));
    const w = Math.max(1, Math.round((im.width || 1) * scale)), h = Math.max(1, Math.round((im.height || 1) * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    try { ctx.drawImage(im, 0, 0, w, h); } catch (e) { }
    let url;
    try { url = c.toDataURL("image/jpeg", 0.85); } catch (e) { url = null; }
    if (!url || url.length < 100) throw new Error("encode");
    if (/^data:image\/png/i.test(String(im.src || "")) && w * h < 400000) url = c.toDataURL("image/png");
    focusEditorAtEnd();
    document.execCommand("insertHTML", false, '<img src="' + url + '" alt="" data-align="center">');
    afterCommand();
    toast(t("toast.img") + " · " + w + "×" + h, "ok");
    renderSize();
  } catch (e) {
    toast(t("toast.imgBad"), "err");
  } finally { done(); }
}

/* ---------------------------------------------------------------- markdown shortcuts */
/* Chrome inserts a NON-BREAKING space (U+00A0) after a word inside a block, so the
   trigger text is "#\u00a0", never "# ". Accept both. */
const SPACE = "[ \\t\\u00a0]";
const BLOCK_RULES = [
  { re: new RegExp("^(#{1,6})" + SPACE + "$"),       run: (m) => blockFmt("h" + m[1].length) },
  { re: new RegExp("^>" + SPACE + "$"),              run: () => blockFmt("blockquote") },
  { re: new RegExp("^[-*+]" + SPACE + "$"),          run: () => exec("insertUnorderedList") },
  { re: new RegExp("^(\\d{1,3})[.)]" + SPACE + "$"), run: () => exec("insertOrderedList") },
  { re: new RegExp("^\\[[ xX]?\\]" + SPACE + "$"),  run: () => toggleTodo() },
  { re: new RegExp("^```" + SPACE + "$"),            run: () => blockFmt("pre") },
];
const NO_TRIGGER = /^(pre|h[1-6])$/;
function blockTextOf(node) {
  const el = node && node.nodeType === 3 ? node.parentElement : node;
  if (!el || el.nodeType !== 1) return null;
  const ed = editor();
  if (!ed.contains(el)) return null;
  let b = el.closest ? el.closest("p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre") : null;
  if (!b) b = el === ed ? ed : null;
  if (!b) return null;
  if (b !== ed && b.querySelector("img,table,ul,ol,pre,blockquote")) return null;
  if (b !== ed && NO_TRIGGER.test(b.tagName)) return null;
  return b;
}
/* Runs on `input`, not `keydown`: for the FIRST character of a block the browser
   puts the caret on the element, so at keydown time there is no text node to read.
   By the time `input` fires the character is in the DOM and the trigger is
   "<markers> <the space just typed>". */
function maybeBlockShortcut() {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed || !s.anchorNode || s.anchorNode.nodeType !== 3) return false;
  const node = s.anchorNode;
  const b = blockTextOf(node.parentElement);
  if (!b) return false;
  const upTo = node.data.slice(0, s.anchorOffset);
  if (!upTo.length || upTo.length > 12) return false;
  for (const r of BLOCK_RULES) {
    const m = r.re.exec(upTo);
    if (!m) continue;
    const ed = editor();
    /* The first line of an empty document is a bare text node directly inside the
       editor, and deleting the trigger can remove that node entirely — leaving the
       command with nothing to act on. Give the line a real block element FIRST. */
    if (b === ed) {
      const p = mk("p");
      node.parentNode.insertBefore(p, node);
      p.appendChild(node);
      const g0 = getSelection();
      g0.setBaseAndExtent(node, 0, node, upTo.length);
    }
    const g = getSelection();
    const from = upTo.length - m[0].length;
    g.setBaseAndExtent(node, from, node, upTo.length);
    try { document.execCommand("delete", false, null); } catch (e) { }
    r.run(m);
    afterCommand();
    return true;
  }
  return false;
}
const INLINE_RULES = [
  { re: /\*\*([^*\n]{1,400})\*\*$/,                    wrap: "bold" },
  { re: /(?<![A-Za-z0-9_])__([^_\n]{1,400})__$/,         wrap: "bold" },
  { re: /(?<![*\w])\*([^*\n]{1,400})\*(?!\*)$/,       wrap: "italic" },
  { re: /(?<![A-Za-z0-9_])_([^_\n]{1,400})_(?![A-Za-z0-9_])$/, wrap: "italic" },
  { re: /~~([^~\n]{1,400})~~$/,                          wrap: "strikeThrough" },
  { re: /`([^`\n]{1,400})`$/,                            wrap: false, code: true },
];
let inlineBusy = false;
function maybeInlineShortcut() {
  if (inlineBusy) return false;
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed || s.anchorNode.nodeType !== 3) return false;
  const node = s.anchorNode, upTo = node.data.slice(0, s.anchorOffset);
  if (upTo.length > 500) return false;
  for (const r of INLINE_RULES) {
    const m = r.re.exec(upTo);
    if (!m) continue;
    inlineBusy = true;
    try {
      const g = getSelection();
      if (r.code) {
        /* the whole `x` is replaced, delimiters included */
        g.setBaseAndExtent(node, upTo.length - m[0].length, node, upTo.length);
        document.execCommand("insertHTML", false, "<code>" + m[1] + "</code>");
      } else {
        /* only the CAPTURED text is formatted; ** ~~ _ delimiters stay as text */
        const from = upTo.length - m[0].length + m[0].indexOf(m[1]);
        g.setBaseAndExtent(node, from, node, from + m[1].length);
        document.execCommand("styleWithCSS", false, false);
        document.execCommand(r.wrap, false, null);
      }
      afterCommand();
    } catch (e) { }
    inlineBusy = false;
    return true;
  }
  return false;
}
function toTodoItem(li) {
  if (li.firstElementChild && li.firstElementChild.tagName === "INPUT") return;
  const done = li.getAttribute("data-done") === "1" ? "1" : "0";
  const box = mk("input", { type: "checkbox", contenteditable: "false" });
  box.setAttribute("data-done", done);
  if (done === "1") box.checked = true;
  const wrap = mk("div");
  while (li.firstChild) wrap.appendChild(li.firstChild);
  li.setAttribute("data-done", "0");
  li.appendChild(box); li.appendChild(wrap);
}
/* Enter inside a to-do list makes the browser insert a bare <li>; give it the
   checkbox + text div structure the list expects. */
function normaliseTodoLists() {
  const ed = editor();
  for (const ul of Array.prototype.slice.call(ed.querySelectorAll("ul[data-todo]"))) {
    for (const li of Array.prototype.slice.call(ul.children)) toTodoItem(li);
  }
}
function flipTodoList(list) {
  const items = Array.prototype.slice.call(list.children);
  const allDone = items.length > 0 && items.every(x => x.getAttribute("data-done") === "1");
  for (const x of items) {
    x.setAttribute("data-done", allDone ? "0" : "1");
    const box = x.querySelector("input[type=checkbox]");
    if (box) box.checked = !allDone;
  }
}
/* Three cases: toggle an existing to-do list, convert a plain list, or turn the
   current block into a single to-do item (the "[] " markdown shortcut). */
function toggleTodo() {
  const ed0 = editor();
  let b = caretBlock();
  if (!b) {
    /* the caret may sit on a checkbox, or the text may be a bare node in the editor */
    const s = getSelection();
    const n = s && s.anchorNode;
    if (n && n.nodeType === 3 && n.parentElement && n.parentElement !== ed0) b = n.parentElement;
    else if (n && n.nodeType === 3 && n.parentElement === ed0) {
      const off = s.anchorOffset;
      const p = mk("p");
      n.parentNode.insertBefore(p, n);
      p.appendChild(n);
      b = p;
      const g = getSelection(); g.setBaseAndExtent(n, off, n, off);
    }
  }
  if (!b) {
    const lists = ed0.querySelectorAll("ul[data-todo]");
    if (lists.length === 1) { b = null; flipTodoList(lists[0]); return; }
  }
  if (b) focusEditorAtEnd();
  const li = b ? b.closest("li") : null;
  const list = li ? li.parentElement : (b ? b.closest("ul,ol") : null);
  if (list && list.hasAttribute("data-todo")) { flipTodoList(list); afterCommand(); return; }
  if (list) {
    list.setAttribute("data-todo", "1");
    Array.prototype.slice.call(list.children).forEach(toTodoItem);
    const last = list.lastElementChild && list.lastElementChild.querySelector("div");
    if (last) { editor().focus(); const g = getSelection(); try { g.setBaseAndExtent(last, 0, last, 0); } catch (e) { } }
    afterCommand(); return;
  }
  const ed = editor();
  if (!b || b === ed || !ed.contains(b)) return;
  const ul = mk("ul", { "data-todo": "1" });
  const item = mk("li", { "data-done": "0" });
  const box = mk("input", { type: "checkbox", contenteditable: "false" });
  box.setAttribute("data-done", "0");
  const wrap = mk("div");
  while (b.firstChild) wrap.appendChild(b.firstChild);
  item.appendChild(box); item.appendChild(wrap);
  ul.appendChild(item);
  b.replaceWith(ul);
  /* the old block was detached, so the caret would fall back to the li start and
     subsequent typing would land before the checkbox - put it inside the text div */
  editor().focus();
  const g = getSelection();
  try { g.setBaseAndExtent(wrap, 0, wrap, 0); } catch (e) { }
  afterCommand();
}
editor().addEventListener("change", (e) => {
  const t = e.target;
  if (t && t.tagName === "INPUT" && t.type === "checkbox") {
    const li = t.closest("li");
    if (li) { li.setAttribute("data-done", t.checked ? "1" : "0"); afterCommand(); }
  }
});

/* ---------------------------------------------------------------- slash menu */
const SLASH = [
  { k: "h1", i: "h1", n: () => t("sl.h1"), d: () => LANG === "bn" ? "শিরোনাম ১" : "Heading 1", f: () => blockFmt("h1") },
  { k: "h2", i: "h2", n: () => t("sl.h2"), d: () => LANG === "bn" ? "শিরোনাম ২" : "Heading 2", f: () => blockFmt("h2") },
  { k: "h3", i: "h3", n: () => t("sl.h3"), d: () => LANG === "bn" ? "শিরোনাম ৩" : "Heading 3", f: () => blockFmt("h3") },
  { k: "quote", i: "quote", n: () => t("sl.quote"), d: () => LANG === "bn" ? "উদ্ধৃতি" : "Block quote", f: () => blockFmt("blockquote") },
  { k: "code", i: "code", n: () => t("sl.code"), d: () => LANG === "bn" ? "কোড ব্লক" : "Code block", f: () => blockFmt("pre") },
  { k: "ul", i: "ul", n: () => t("sl.ul"), d: () => LANG === "bn" ? "বুলেট তালিকা" : "Bulleted list", f: () => exec("insertUnorderedList") },
  { k: "ol", i: "ol", n: () => t("sl.ol"), d: () => LANG === "bn" ? "সংখ্যাযুক্ত তালিকা" : "Numbered list", f: () => exec("insertOrderedList") },
  { k: "todo", i: "todo", n: () => t("sl.todo"), d: () => LANG === "bn" ? "খোঁজা খবরের তালিকা" : "To-do list", f: () => toggleTodo() },
  { k: "table", i: "table", n: () => t("sl.table"), d: () => LANG === "bn" ? "টেবিল" : "Table", f: () => { hideSlash(); insertTable(3, 3); } },
  { k: "image", i: "image", n: () => t("sl.image"), d: () => LANG === "bn" ? "ছবি" : "Image", f: () => { hideSlash(); $("imgInput").click(); } },
  { k: "divider", i: "rule", n: () => t("sl.divider"), d: () => LANG === "bn" ? "আলাদা করার রেখা" : "Divider", f: () => exec("insertHorizontalRule") },
  { k: "page", i: "page", n: () => t("sl.page"), d: () => LANG === "bn" ? "পাতা ভাঙা" : "Page break", f: () => insertPageBreak() },
  { k: "link", i: "link", n: () => t("sl.link"), d: () => LANG === "bn" ? "লিংক" : "Link", f: () => { hideSlash(); linkDialog(); } },
];
let slashState = null;
function slashQuery() {
  const s = getSelection();
  if (!s.rangeCount || s.anchorNode.nodeType !== 3) return null;
  const upTo = s.anchorNode.data.slice(0, s.anchorOffset);
  const m = /(?:^|\s)\/([a-z0-9]*)$/i.exec(upTo);
  if (!m) return null;
  const b = s.anchorNode.parentElement;
  if (!b || !editor().contains(b)) return null;
  if (b.tagName === "PRE" || b.tagName === "CODE") return null;
  return { node: s.anchorNode, start: upTo.length - m[0].length, end: upTo.length, q: m[1].toLowerCase() };
}
function showSlash() {
  const st = slashQuery();
  if (!st) { hideSlash(); return; }
  const list = SLASH.filter(x => x.k.indexOf(st.q) === 0);
  if (!list.length) { hideSlash(); return; }
  slashState = { st, list, sel: 0 };
  const m = $("slash");
  m.textContent = "";
  list.forEach((x, i) => {
    const b = mk("button", { class: "si", type: "button", role: "option", "data-sel": i === 0 ? "1" : "0", "aria-selected": String(i === 0) }, [
      mk("span", { class: "ic" }, icon(x.i, "ico-14")), mk("span", { class: "nm", text: x.n() }), mk("span", { class: "ds", text: x.d() }),
    ]);
    b.addEventListener("mousedown", e => { e.preventDefault(); runSlash(i); });
    m.appendChild(b);
  });
  m.classList.remove("hidden");
  const r = document.createRange(); r.setStart(st.node, st.start); r.collapse(true);
  const rr = r.getBoundingClientRect();
  const h = m.offsetHeight || 260;
  m.style.left = clamp(rr.left, 8, window.innerWidth - 272) + "px";
  m.style.top = clamp(rr.bottom + 4, 8, window.innerHeight - h - 8) + "px";
}
function hideSlash() { $("slash").classList.add("hidden"); slashState = null; }
function runSlash(i) {
  if (!slashState) return;
  const st = slashState.st, item = slashState.list[i];
  if (!item) return;
  hideSlash();
  try {
    const g = getSelection();
    g.setBaseAndExtent(st.node, st.start, st.node, st.end);
    document.execCommand("delete", false, null);
  } catch (e) {
    /* the trigger text node was replaced while typing - fall back to a text search */
    const host = blockTextOf(st.node && st.node.parentElement) || editor();
    const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let n2;
    while ((n2 = tw.nextNode())) {
      const at = n2.nodeValue.indexOf("/" + st.q);
      if (at !== -1) {
        const g2 = getSelection();
        g2.setBaseAndExtent(n2, at, n2, at + 1 + st.q.length);
        document.execCommand("delete", false, null);
        break;
      }
    }
  }
  item.f();
  afterCommand();
}
function slashMove(dir) {
  if (!slashState) return;
  slashState.sel = (slashState.sel + dir + slashState.list.length) % slashState.list.length;
  $("slash").querySelectorAll(".si").forEach((n, i) => { n.setAttribute("data-sel", String(i === slashState.sel)); n.setAttribute("aria-selected", String(i === slashState.sel)); });
  const cur = $("slash").querySelectorAll(".si")[slashState.sel];
  if (cur) cur.scrollIntoView({ block: "nearest" });
}
function insertPageBreak() {
  focusEditorAtEnd();
  try { document.execCommand("insertHTML", false, '<div class="yd-pagebreak" contenteditable="false"><span>' + (LANG === "bn" ? "নতুন পৃষ্ঠা" : "Page break") + '</span></div><p><br></p>'); } catch (e) { return; }
  afterCommand();
}

/* ---------------------------------------------------------------- find & replace */
const find = { q: "", r: "", hits: [], cur: -1, marks: [], useHighlight: false };
function clearFindVisuals() {
  for (const m of find.marks) { const p = m.parentNode; if (p) { while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); } }
  find.marks = [];
  if (find.useHighlight && window.CSS && CSS.highlights) { try { CSS.highlights.delete("yd-find"); CSS.highlights.delete("yd-find-active"); } catch (e) { } }
}
function textNodesIn(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest(".yd-pagebreak")) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n; while ((n = w.nextNode())) out.push(n);
  return out;
}
function runFind() {
  clearFindVisuals();
  find.q = $("findQ").value;
  find.r = $("findR").value;
  find.hits = []; find.cur = -1;
  if (!find.q) { updateFindCount(); return; }
  const needle = find.q.toLowerCase();
  const nodes = textNodesIn(editor());
  const ranges = [];
  for (const n of nodes) {
    const s = n.nodeValue.toLowerCase();
    let i = 0;
    while ((i = s.indexOf(needle, i)) !== -1) {
      const r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + find.q.length);
      ranges.push(r);
      i += Math.max(1, find.q.length);
      if (ranges.length > 5000) break;
    }
    if (ranges.length > 5000) break;
  }
  find.hits = ranges;
  find.useHighlight = !!(window.CSS && CSS.highlights && typeof CSS.highlights.set === "function" && ranges.length);
  if (find.useHighlight) {
    try {
      const H = window.Highlight || (window.Highlight && window.Highlight.prototype && null);
      if (H) {
        const all = new H(...ranges);
        CSS.highlights.set("yd-find", all);
        find.cur = 0;
        paintActiveHighlight();
      } else { find.useHighlight = false; }
    } catch (e) { find.useHighlight = false; }
  }
  if (!find.useHighlight) {
    for (const r of ranges) {
      try {
        const m = document.createElement("mark");
        m.setAttribute("data-yfm", "1");
        r.surroundContents(m);
        find.marks.push(m);
      } catch (e) { }
    }
    if (find.marks.length) { find.cur = 0; paintActiveMark(); }
  }
  if (find.hits.length) findJump(find.cur >= 0 ? find.cur : 0);
  updateFindCount();
}
function paintActiveHighlight() {
  try {
    const H = window.Highlight;
    if (!H || find.cur < 0 || !find.hits[find.cur]) return;
    CSS.highlights.set("yd-find-active", new H(find.hits[find.cur]));
  } catch (e) { }
}
function paintActiveMark() {
  find.marks.forEach((m, i) => { if (i === find.cur) m.setAttribute("data-cur", "1"); else m.removeAttribute("data-cur"); });
}
function updateFindCount() {
  const c = $("findCount");
  if (!find.q) c.textContent = "0/0";
  else if (!find.hits.length) c.textContent = t("find.none");
  else c.textContent = (find.cur + 1) + "/" + find.hits.length;
}
function findJump(i) {
  if (!find.hits.length) { updateFindCount(); return; }
  find.cur = ((i % find.hits.length) + find.hits.length) % find.hits.length;
  if (find.useHighlight) paintActiveHighlight(); else paintActiveMark();
  const r = find.hits[find.cur];
  try {
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r.cloneRange());
    const rect = r.getBoundingClientRect();
    if (rect.top < 60 || rect.bottom > window.innerHeight - 60) r.startContainer.parentElement.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch (e) { }
  updateFindCount();
}
function findReplaceCurrent() {
  if (!find.q || find.cur < 0 || !find.hits[find.cur]) return;
  const r = find.hits[find.cur];
  const sel = getSelection();
  sel.removeAllRanges(); sel.addRange(r);
  const rText = editor().ownerDocument.createTextNode(find.r);
  r.deleteContents();
  r.insertNode(rText);
  afterCommand();
  runFind();
  if (find.hits.length) findJump(Math.min(find.cur, find.hits.length - 1));
}
function findReplaceAll() {
  if (!find.q) return 0;
  let n = 0;
  for (let i = find.hits.length - 1; i >= 0; i--) {
    try {
      const r = find.hits[i];
      r.deleteContents();
      r.insertNode(editor().ownerDocument.createTextNode(find.r));
      n++;
    } catch (e) { }
  }
  if (n) afterCommand();
  runFind();
  return n;
}
function openFind(withReplace) {
  $("findbar").classList.remove("hidden");
  $("findR").style.display = withReplace ? "" : "none";
  $("findR").classList.toggle("has-eye", false);
  $("findRepl").style.display = withReplace ? "" : "none";
  $("findAll").style.display = withReplace ? "" : "none";
  if (withReplace) $("findR").classList.add("has-eye");
  $("findQ").focus(); $("findQ").select();
}
function closeFind() {
  $("findbar").classList.add("hidden");
  clearFindVisuals(); find.hits = []; find.cur = -1;
  editor().focus();
}

/* ---------------------------------------------------------------- zoom / modes */
function setZoom(z) {
  z = clamp(z, 0.6, 2.2);
  sset("zoom", z);
  const inner = $("canvasInner");
  inner.style.setProperty("--zoom", z);
  inner.style.transform = z === 1 ? "" : "scale(" + z + ")";
  inner.style.transformOrigin = "top center";
  inner.style.width = z === 1 ? "" : (100 / z) + "%";
  inner.style.marginBottom = z === 1 ? "" : (100 * (z - 1)) + "vh";
  drawGuides();
}
function toggleFocusMode(on) {
  const el = editor();
  if (on === undefined) on = !document.body.classList.contains("focus-mode");
  document.body.classList.toggle("focus-mode", on);
  if (on) el.setAttribute("style", (el.getAttribute("style") || "") + "max-width:68ch;margin:0 auto;");
  else el.removeAttribute("data-fm");
  sset("focus", on);
  drawGuides();
}
function openReading() {
  if (!state.unlocked) return;
  $("readingBody").innerHTML = editor().innerHTML;
  $("reading").classList.add("on");
  document.body.classList.add("reading");
  $("readClose").focus();
}
function closeReading() {
  $("reading").classList.remove("on");
  document.body.classList.remove("reading");
  editor().focus();
}

/* ---------------------------------------------------------------- clipboard / export helpers */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { }
  try {
    const ta = mk("textarea", { style: "position:fixed;top:-1000px;opacity:0" });
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch (e) { return false; }
}
function blockToMd(el) {
  const kids = Array.prototype.slice.call(el.childNodes);
  const inline = () => kids.map(n => nodeToMd(n)).join("");
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return "#".repeat(Number(tag[1])) + " " + inline() + "\n\n";
    case "p": return inline().replace(/\u00a0/g, " ") + "\n\n";
    case "blockquote": return Array.prototype.slice.call(el.children).map(blockToMd).join("").split("\n").map(l => "> " + l).join("\n") + "\n\n";
    case "pre": return "```\n" + el.textContent.replace(/^\n+|\n+$/g, "") + "\n```\n\n";
    case "hr": return "---\n\n";
    case "ul": {
      const todo = el.hasAttribute("data-todo");
      return Array.prototype.slice.call(el.children).map(li => {
        const done = li.getAttribute("data-done") === "1";
        const src = li.querySelector("div") || li;
        return (todo ? "- [" + (done ? "x" : " ") + "] " : "- ") + nodesToMd(src.childNodes).replace(/\n+/g, " ").trim() + "\n";
      }).join("") + "\n";
    }
    case "ol": return Array.prototype.slice.call(el.children).map((li, i) => {
      const src = li.querySelector("div") || li;
      return (i + 1) + ". " + nodesToMd(src.childNodes).replace(/\n+/g, " ").trim() + "\n";
    }).join("") + "\n";
    case "table": {
      const rows = Array.prototype.slice.call(el.querySelectorAll("tr"));
      if (!rows.length) return "";
      const cellText = (td) => (td.innerText || "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
      const line = (tr) => "| " + Array.prototype.slice.call(tr.cells).map(cellText).join(" | ") + " |";
      const head = line(rows[0]);
      const cols = rows[0].cells.length;
      return head + "\n| " + Array.from({ length: cols }, () => "---").join(" | ") + " |\n" + rows.slice(1).map(line).join("\n") + "\n\n";
    }
    case "figure": {
      const img = el.querySelector("img");
      const cap = el.querySelector("figcaption");
      return (img ? nodeToMd(img) + "\n" : "") + (cap ? "*" + (cap.textContent || "").trim() + "*\n" : "") + "\n";
    }
    case "figcaption": return "*" + el.textContent.trim() + "*\n\n";
    case "div": if (el.classList.contains("yd-pagebreak")) return "\n---\n\n"; return inline();
    default: return inline();
  }
}
function nodesToMd(nodes) { return Array.prototype.slice.call(nodes || []).map(nodeToMd).join(""); }
function nodeToMd(n) {
  if (n.nodeType === 3) return (n.nodeValue || "").replace(/\u00a0/g, " ");
  if (n.nodeType !== 1) return "";
  const tag = n.tagName.toLowerCase();
  const inner = () => Array.prototype.slice.call(n.childNodes).map(nodeToMd).join("");
  const cls = n.className || "";
  if (/yhl-\d/.test(cls)) return "==" + inner() + "==";
  switch (tag) {
    case "strong": case "b": return "**" + inner() + "**";
    case "em": case "i": return "*" + inner() + "*";
    case "s": case "strike": case "del": return "~~" + inner() + "~~";
    case "u": return inner();
    case "code": return n.closest("pre") ? inner() : "`" + inner() + "`";
    case "mark": return "==" + inner() + "==";
    case "sub": return "~" + inner() + "~";
    case "sup": return "^" + inner() + "^";
    case "a": { const h = n.getAttribute("href") || ""; return "[" + inner() + "](" + h + ")"; }
    case "img": return "![" + (n.getAttribute("alt") || "image") + "](" + (n.getAttribute("src") || "") + ")";
    case "br": return "\n";
    default: return inner();
  }
}
function toMarkdown() {
  const parts = Array.prototype.slice.call(editor().children).map(blockToMd).join("");
  const title = state.doc.meta.title || "";
  return (title ? "# " + title + "\n\n" : "") + parts.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
function toPlainText() {
  const parts = [];
  const walk = (el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "script" || tag === "style") return;
    if (/^h[1-6]$/.test(tag)) { parts.push((el.innerText || "").trim()); parts.push(""); return; }
    if (tag === "p" || tag === "li" || tag === "blockquote" || tag === "pre" || tag === "tr") { parts.push((el.innerText || "").trim()); if (tag !== "td" && tag !== "th") parts.push(""); return; }
    if (tag === "table") { Array.prototype.slice.call(el.rows).forEach(r => parts.push(Array.prototype.slice.call(r.cells).map(c => (c.innerText || "").trim()).join("\t"))); parts.push(""); return; }
    if (tag === "hr" || (el.classList && el.classList.contains("yd-pagebreak"))) { parts.push("───────────"); parts.push(""); return; }
    Array.prototype.slice.call(el.childNodes).forEach(walk);
  };
  Array.prototype.slice.call(editor().childNodes).forEach(n => n.nodeType === 1 ? walk(n) : parts.push(n.nodeValue));
  return (state.doc.meta.title ? state.doc.meta.title + "\n" + "=".repeat(Math.min(60, state.doc.meta.title.length)) + "\n\n" : "") + parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
