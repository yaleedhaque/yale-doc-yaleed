/* ==========================================================================
   YaleDoc v2 — UI layer: i18n, toasts, dialogs, rail, status, error boundary
   ========================================================================== */

function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach(n => { n.textContent = t(n.getAttribute("data-i18n")); });
  scope.querySelectorAll("[data-i18n-ph]").forEach(n => { n.placeholder = t(n.getAttribute("data-i18n-ph")); });
  scope.querySelectorAll("[data-i18n-aria]").forEach(n => { n.setAttribute("aria-label", t(n.getAttribute("data-i18n-aria"))); });
  document.documentElement.lang = LANG === "bn" ? "bn" : "en";
}
function setLang(lang) {
  LANG = I18N[lang] ? lang : "en";
  document.documentElement.setAttribute("data-lang", LANG);
  applyI18n();
  renderRailAll();
  updateStatus();
  try { paintStrength("setupPw", "setupMeter", "setupNote"); } catch (e) { }
}

/* ---------------------------------------------------------------- password score */
const COMMON_PW = new Set(["password", "123456", "12345678", "qwerty", "abc123", "111111", "123123", "letmein", "admin", "welcome", "iloveyou", "monkey", "dragon", "football", "sunshine", "princess", "000000", "passw0rd", "yaleed"]);
function pwScore(v) {
  v = v || "";
  if (!v) return 0;
  if (COMMON_PW.has(v.toLowerCase())) return 0;
  let s = 0;
  const l = v.length;
  if (l >= 8) s++; if (l >= 12) s++; if (l >= 16) s++; if (l >= 22) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  if (l < 8) s = Math.min(s, 1);
  return clamp(s, 0, 6);
}
function pwHintKey(v) { const s = pwScore(v); return s <= 1 ? "pw.hint1" : s === 2 ? "pw.hint2" : s === 3 ? "pw.hint3" : "pw.hint4"; }
function paintStrength(inputId, meterId, noteId) {
  const v = $(inputId).value, s = pwScore(v);
  const el = $(meterId);
  el.style.width = Math.round(s / 6 * 100) + "%";
  el.style.background = s <= 2 ? "var(--danger)" : s <= 3 ? "var(--warn)" : "var(--ok)";
  if (noteId) $(noteId).textContent = t(pwHintKey(v));
  return s;
}

/* ---------------------------------------------------------------- toast */
let toastSeq = 0;
function toast(msg, kind, action) {
  const host = $("toasts");
  if (!host) return;
  while (host.children.length >= 3) host.removeChild(host.firstChild);
  const id = ++toastSeq;
  const n = mk("div", { class: "toast" + (kind ? " " + kind : ""), role: "status", "data-id": id }, [
    kind ? icon(kind === "ok" ? "check" : kind === "err" ? "warn" : "info", "ico-20") : null,
    mk("span", { class: "msg", text: msg }),
  ]);
  if (action && action.label) n.appendChild(mk("button", { class: "act", type: "button", onclick: () => { action.fn(); kill(); } }, action.label));
  host.appendChild(n);
  let done = false;
  const kill = () => { if (done) return; done = true; n.classList.add("out"); setTimeout(() => n.remove(), 220); };
  const timer = setTimeout(kill, action && action.keep ? 9000 : 3600);
  n.addEventListener("mouseenter", () => clearTimeout(timer));
  return n;
}

/* ---------------------------------------------------------------- busy */
let busyDepth = 0;
function busyOn(text, sub, indeterminate) {
  busyDepth++;
  const b = $("busy");
  $("busyText").textContent = text || "Working…";
  $("busySub").textContent = sub || "";
  b.classList.toggle("indet", indeterminate !== false);
  b.classList.remove("hidden");
  return () => { busyDepth = Math.max(0, busyDepth - 1); if (!busyDepth) b.classList.add("hidden"); };
}
function busyProg(pct, sub) { $("busyBar").firstElementChild.style.width = clamp(pct, 0, 100) + "%"; $("busySub").textContent = sub || ""; }
function busyOff() { busyDepth = 0; $("busy").classList.add("hidden"); }

/* ---------------------------------------------------------------- dialogs */
const openStack = [];
function focusables(root) {
  return Array.prototype.slice.call(root.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),summary'
  )).filter(n => n.offsetParent !== null || n.getClientRects().length);
}
function openDialog(opts) {
  const host = $("dlgHost");
  const prev = document.activeElement;
  const scrim = mk("div", { class: "scrim", role: "dialog", "aria-modal": "true", "aria-label": opts.title || "Dialog" });
  const dlg = mk("div", { class: "dlg" + (opts.cls ? " " + opts.cls : "") });
  const head = mk("div", { class: "dlg-h" }, [
    mk("h2", { text: opts.title || "" }),
    opts.noClose ? null : mk("button", { class: "x", type: "button", "aria-label": "Close", onclick: () => close() }, icon("x")),
  ]);
  if (opts.lede) dlg.appendChild(mk("p", { class: "lede", html: opts.lede }));
  const bodyWrap = mk("div", { class: "dlg-body" });
  if (opts.body) bodyWrap.appendChild(opts.body);
  dlg.appendChild(head); dlg.appendChild(bodyWrap);
  if (opts.actions && opts.actions.length) {
    const row = mk("div", { class: "btnrow" + (opts.split ? " split" : "") });
    opts.actions.forEach(a => {
      if (a.spacer) { row.appendChild(mk("span", { class: "spacer" })); return; }
      const b = mk("button", { class: "btn" + (a.kind ? " " + a.kind : ""), type: "button", onclick: () => a.onClick ? a.onClick(close) : close() }, a.label);
      if (a.ref) a.ref(b);
      row.appendChild(b);
    });
    dlg.appendChild(row);
  }
  scrim.appendChild(dlg);
  host.appendChild(scrim);
  const api = {
    root: scrim, body: bodyWrap, dlg,
    close() {
      if (api._closed) return; api._closed = true;
      const i = openStack.indexOf(api); if (i >= 0) openStack.splice(i, 1);
      document.removeEventListener("keydown", onKey, true);
      scrim.remove();
      if (!openStack.length) host.classList.add("hidden");
      if (prev && prev.focus) try { prev.focus(); } catch (e) { }
      if (opts.onClose) opts.onClose();
    },
    _closed: false,
  };
  function onKey(e) {
    if (openStack[openStack.length - 1] !== api) return;
    if (e.key === "Escape" && !opts.noEsc) { e.preventDefault(); e.stopPropagation(); api.close(); return; }
    if (e.key === "Tab") {
      const f = focusables(dlg);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dlg.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  }
  scrim.addEventListener("mousedown", e => { if (e.target === scrim && !opts.noDismiss) api.close(); });
  host.classList.remove("hidden");
  openStack.push(api);
  document.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => {
    const f = focusables(dlg);
    const target = opts.focus ? opts.focus(dlg) : (f.find(n => /input|select|textarea/.test(n.tagName.toLowerCase())) || f[0]);
    if (target) { try { target.focus(); if (target.select) target.select(); } catch (e) { } }
    if (opts.onOpen) opts.onOpen(api);
  });
  return api;
}
function closeTopDialog() { if (openStack.length) { openStack[openStack.length - 1].close(); return true; } return false; }

function confirmDlg(o) {
  return new Promise(res => {
    let done = false;
    const d = openDialog({
      title: o.title, lede: o.lede, cls: "narrow", noDismiss: true,
      actions: [
        { label: o.cancelLabel || (LANG === "bn" ? "বাতিল" : "Cancel"), onClick: c => { done = true; c(); res(false); } },
        { label: o.okLabel || (LANG === "bn" ? "ঠিক আছে" : "Continue"), kind: o.danger ? "danger" : "primary", onClick: c => { done = true; c(); res(true); } },
      ],
      onClose() { if (!done) res(false); },
    });
    void d;
  });
}
function alertDlg(o) {
  return openDialog({
    title: o.title, lede: o.lede, cls: "narrow",
    body: o.body || null,
    actions: [{ label: o.okLabel || (LANG === "bn" ? "ঠিক আছে" : "OK"), kind: "primary" }],
  });
}
function promptPwd(o) {
  return new Promise(res => {
    let done = false;
    const wrap = mk("div");
    const inp = mk("input", { class: "inp", type: "password", autocomplete: o.auto || "off", spellcheck: "false" });
    const eye = mk("button", { class: "eye", type: "button", "aria-label": "Show password" }, icon("eye", "ico-20"));
    const meter = mk("i");
    const note = mk("div", { class: "hint" });
    if (o.showMeter) {
      const bar = mk("div", { class: "strength" }, meter);
      wrap.appendChild(bar); wrap.appendChild(note);
      inp.addEventListener("input", () => {
        const s = pwScore(inp.value);
        meter.style.width = Math.round(s / 6 * 100) + "%";
        meter.style.background = s <= 2 ? "var(--danger)" : s <= 3 ? "var(--warn)" : "var(--ok)";
        note.textContent = t(pwHintKey(inp.value));
      });
    }
    wrap.insertBefore(mk("div", { class: "pwwrap" }, [inp, eye]), wrap.firstChild);
    eye.addEventListener("click", () => {
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      eye.replaceChild(icon(show ? "eye-off" : "eye", "ico-20"), eye.firstChild);
      inp.focus();
    });
    const d = openDialog({
      title: o.title, lede: o.lede, cls: "narrow", body: wrap,
      actions: [
        { label: o.cancelLabel || (LANG === "bn" ? "বাতিল" : "Cancel"), onClick: c => { done = true; c(); res(null); } },
        { label: o.okLabel || (LANG === "bn" ? "ঠিক আছে" : "Continue"), kind: "primary", onClick: c => { done = true; c(); res(inp.value); } },
      ],
      onClose() { if (!done) res(null); },
      focus: () => inp,
    });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { done = true; d.close(); res(inp.value); } });
  });
}

/* ---------------------------------------------------------------- theme / settings */
const PAGE = {
  a4: { w: 794, h: 1123, m: { narrow: 40, normal: 62, wide: 92 } },
  letter: { w: 816, h: 1056, m: { narrow: 42, normal: 64, wide: 96 } },
};
const FONTS = {
  sans: 'var(--doc-sans)', serif: 'var(--doc-serif)', mono: 'var(--mono)', bengali: 'var(--doc-bengali)',
};
function applySettings() {
  const s = state.doc.settings;
  document.documentElement.dataset.theme = s.theme;
  const p = PAGE[s.page] || PAGE.a4;
  const root = document.documentElement.style;
  root.setProperty("--page-w", p.w + "px");
  root.setProperty("--page-h", p.h);
  root.setProperty("--page-marg", (p.m[s.margin] || p.m.normal) + "px");
  const el = editor();
  el.style.setProperty("--font-doc", FONTS[s.font] || FONTS.sans);
  el.style.setProperty("--doc-pt", s.size + "pt");
  el.style.setProperty("--doc-lh", s.leading);
  el.setAttribute("data-ph", LANG === "bn" ? "লিখতে শুরু করুন…" : "Start writing…");
  document.body.classList.toggle("guides-off", !s.guides);
  scheduleGuides();
  syncSettingsUI();
}
function scheduleGuides() { const f = rafThrottle(drawGuides); f(); }
function drawGuides() {
  const g = $("guides"), el = editor();
  if (!g || !el || !state.doc) return;
  const m = pageMetrics();
  if ($("stPages")) $("stPages").textContent = num(m.pages);
  g.textContent = "";
  if (!state.doc.settings.guides) return;
  const box = $("pageStack");
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
  const n = m.pages;
  for (let i = 1; i <= Math.min(n, 500); i++) {
    g.appendChild(mk("div", { class: "guide", style: "top:" + (top + i * m.usable) + "px" }, mk("span", { text: String(i + 1) })));
  }
}
function pageMetrics() {
  const el = editor();
  const p = PAGE[(state.doc && state.doc.settings.page) || "a4"] || PAGE.a4;
  if (!el) return { usable: p.h, pages: 1, chrome: 0 };
  const cs = getComputedStyle(el);
  const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const usable = p.h - chrome;
  if (!(usable > 40)) return { usable: 1, pages: 1, chrome: 0 };
  let pages = 1, acc = 0;
  for (const n of Array.prototype.slice.call(el.children)) {
    const hgt = n.getBoundingClientRect().height || 0;
    if (n.classList && n.classList.contains("yd-pagebreak")) { pages++; acc = 0; continue; }
    if (acc + hgt > usable) { pages++; acc = hgt; } else acc += hgt;
  }
  return { usable, pages: Math.max(1, pages), chrome };
}
function applyLangFromDoc() { setLang(state.doc.settings.lang || "en"); }

/* ---------------------------------------------------------------- status bar */
function setSaveState(kind, text) {
  const s = $("saveState");
  s.dataset.s = kind;
  $("stSaved").textContent = text !== undefined ? text : t(kind === "dirty" ? "save.dirty" : kind === "saving" ? "save.saving" : kind === "never" ? "save.never" : "save.clean");
}
function markDirty() {
  if (!state.unlocked) return;
  state.dirty = true;
  setSaveState("dirty");
  scheduleGuides(); updateStatus();
}
function updateStatus() {
  if (!state.doc) return;
  const el = editor();
  const text = el.innerText || "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $("stWords").textContent = num(words);
  $("stChars").textContent = num(text.length);
  $("mWords").textContent = num(words);
  $("mChars").textContent = num(text.length);
  $("mParas").textContent = num(el.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th").length || 0);
  $("mRead").textContent = Math.max(1, Math.round(words / 200)) + (LANG === "bn" ? " মিনিট" : "m");
  el.setAttribute("data-empty", el.childNodes.length === 0 || (el.textContent === "" && !el.querySelector("img,hr,table")) ? "true" : "false");
  scheduleGuides();
  if (state.railOpen === "outline") renderOutline();
  const al = state.doc.settings.autolock;
  const w = $("stLockWrap");
  if (al > 0 && state.unlocked) {
    w.hidden = false;
    const left = Math.max(0, Math.ceil((state.autolockAt - Date.now()) / 60000));
    $("unlockTimer").textContent = left + (LANG === "bn" ? " মিনিট" : "m");
  } else w.hidden = true;
}

/* ---------------------------------------------------------------- rail */
function setRail(pane) {
  const app = $("app");
  const same = app.dataset.rail === pane;
  const next = same ? "none" : pane;
  app.dataset.rail = next;
  state.railOpen = next;
  $("railBtn").setAttribute("aria-pressed", next === "none" ? "false" : "true");
  if (next !== "none") {
    document.querySelectorAll(".rail-tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.pane === next)));
    document.querySelectorAll(".rail-panel").forEach(p => p.toggleAttribute("data-active", p.id === "pane" + next[0].toUpperCase() + next.slice(1)));
    renderRail(next);
  }
  $("railScrim").classList.toggle("hidden", window.innerWidth > 760);
}
function renderRailAll() { ["outline", "history", "files", "settings"].forEach(renderRail); renderOutline(); }
function renderRail(pane) {
  if (pane === "outline") renderOutline();
  else if (pane === "history") renderHistory();
  else if (pane === "files") { renderFiles(); renderSize(); }
  else if (pane === "settings") syncSettingsUI();
}
function renderOutline() {
  const host = $("outlineList");
  if (!host) return;
  const items = Array.prototype.slice.call(editor().querySelectorAll("h1,h2,h3,h4,h5,h6"));
  $("outlineCount").textContent = num(items.length);
  host.textContent = "";
  if (!items.length) {
    host.appendChild(mk("div", { class: "empty" }, [icon("tree", "ico-24"), mk("div", { text: LANG === "bn" ? "এখনো কোনো শিরোনাম নেই।" : "No headings yet. Type a line starting with # followed by a space." })]));
    return;
  }
  items.forEach((h, i) => {
    if (!h.id) h.id = "yd-h-" + i;
    const b = mk("button", { class: "outline-item", type: "button", "data-lvl": h.tagName[1], text: (h.textContent || "").trim() || (LANG === "bn" ? "(শিরোনাম)" : "(untitled)") });
    b.addEventListener("click", () => { h.scrollIntoView({ block: "start", behavior: "smooth" }); focusNode(h); });
    host.appendChild(b);
  });
}
function renderHistory() {
  const host = $("historyList");
  if (!host) return;
  host.textContent = "";
  const list = (state.doc && state.doc.history) || [];
  if (!list.length) { host.appendChild(mk("div", { class: "empty" }, [icon("history", "ico-24"), mk("div", { text: t("hist.empty") })])); return; }
  list.forEach((h, i) => {
    const n = mk("button", { class: "hist-item", type: "button" }, [
      mk("div", { class: "t", text: h.label || t("snap.auto") }),
      mk("div", { class: "m" }, [
        mk("span", { text: when(h.ts) }),
        mk("span", { text: bytes(h.size || 0) }),
      ]),
    ]);
    const row = mk("div", { class: "hist-actions" }, [
      mk("button", {
        class: "chipbtn", type: "button", text: t("hist.restore"), onclick: async (e) => {
          e.stopPropagation();
          if (!(await confirmDlg({ title: t("hist.restore"), lede: LANG === "bn" ? "বর্তমান অপরিবর্তিত লেখা এই স্ন্যাপশট দিয়ে প্রতিস্থাপিত হবে।" : "Your current text will be replaced by this snapshot.", okLabel: t("hist.restore") }))) return;
          loadHtml(h.content); markDirty(); renderHistory(); toast(t("toast.restored"), "ok");
        }
      }),
      mk("button", {
        class: "chipbtn", type: "button", text: t("hist.del"), onclick: (e) => {
          e.stopPropagation();
          state.doc.history.splice(i, 1); markDirty(); renderHistory();
        }
      }),
    ]);
    n.appendChild(row);
    host.appendChild(n);
  });
}
function renderFiles() {
  const host = $("fileList");
  if (!host) return;
  host.textContent = "";
  const list = (state.doc && state.doc.attachments) || [];
  if (!list.length) { host.appendChild(mk("div", { class: "empty" }, [icon("clip", "ico-24"), mk("div", { text: t("files.empty") })])); return; }
  list.forEach((a, i) => {
    const row = mk("div", { class: "file-row" }, [
      icon("doc", "ico-20"),
      mk("div", { style: "flex:1;min-width:0" }, [
        mk("div", { class: "nm", text: a.name }),
        mk("div", { class: "sub", text: bytes(a.size || 0) + " · " + (a.type || "file") }),
      ]),
      mk("button", { class: "iconbtn sm", type: "button", title: t("files.get"), "aria-label": t("files.get") + ": " + a.name, onclick: () => saveAttachment(a) }, icon("download", "ico-20")),
      mk("button", { class: "iconbtn sm", type: "button", title: t("files.del"), "aria-label": t("files.del") + ": " + a.name, onclick: () => { state.doc.attachments.splice(i, 1); markDirty(); renderFiles(); renderSize(); } }, icon("trash", "ico-20")),
    ]);
    host.appendChild(row);
  });
}
function estPayloadBytes() {
  if (!state.doc) return 0;
  const live = state.unlocked ? editor().innerHTML.length : (state.doc.content || "").length;
  const html = live;
  const att = (state.doc.attachments || []).reduce((s, a) => s + (a.size || 0), 0);
  const hist = (state.doc.history || []).reduce((s, h) => s + (h.size || 0), 0);
  return html * 2 + att * 1.37 + hist * 1.37 + 46000;
}
function renderSize() {
  const n = estPayloadBytes();
  const pct = clamp(n / FMT.maxFileBytes * 100, 0, 100);
  const m = $("sizeMeter");
  if (!m) return;
  m.firstElementChild.style.width = pct + "%";
  m.className = "meter" + (pct > 85 ? " danger" : pct > 60 ? " warn" : "");
  $("sizeText").textContent = bytes(n) + " / " + bytes(FMT.maxFileBytes);
  const tag = $("sizeTag");
  tag.textContent = pct > 85 ? (LANG === "bn" ? "খুব বড়" : "Very large") : pct > 60 ? (LANG === "bn" ? "বড়" : "Large") : (LANG === "bn" ? "ভালো" : "Fine");
  tag.className = "tag" + (pct > 85 ? " danger" : pct > 60 ? " warn" : " ok");
}

/* ---------------------------------------------------------------- settings UI */
function optGroup(id, items, cur, onPick) {
  const box = $(id);
  if (!box) return;
  box.textContent = "";
  items.forEach(it => {
    const b = mk("button", { class: "opt", type: "button", "aria-pressed": String(it.v === cur), "data-v": String(it.v) }, it.label !== undefined ? it.label : String(it.v));
    b.addEventListener("click", () => { onPick(it.v); });
    box.appendChild(b);
  });
}
const THEME_LABEL = { paper: "paper", ink: "ink", sepia: "sepia" };
let settingsBound = false;
function syncSettingsUI() {
  if (!state.doc) return;
  const s = state.doc.settings;
  optGroup("optTheme", Object.keys(THEME_LABEL).map(k => ({ v: k, label: t("theme." + k) === "theme." + k ? k[0].toUpperCase() + k.slice(1) : t("theme." + k) })), s.theme, v => { s.theme = v; applySettings(); markDirty(); });
  optGroup("optPage", [{ v: "a4", label: "A4" }, { v: "letter", label: "US Letter" }], s.page, v => { s.page = v; applySettings(); markDirty(); });
  optGroup("optMargin", [{ v: "narrow", label: LANG === "bn" ? "সরু" : "Narrow" }, { v: "normal", label: LANG === "bn" ? "স্বাভাবিক" : "Normal" }, { v: "wide", label: LANG === "bn" ? "চওড়া" : "Wide" }], s.margin, v => { s.margin = v; applySettings(); markDirty(); });
  optGroup("optLeading", [{ v: 1.4, label: "1.4" }, { v: 1.62, label: "1.62" }, { v: 1.9, label: "1.9" }], s.leading, v => { s.leading = Number(v); applySettings(); markDirty(); });
  optGroup("optAutolock", [0, 1, 5, 10, 30].map(n => ({ v: n, label: n === 0 ? (LANG === "bn" ? "বন্ধ" : "Off") : n + (LANG === "bn" ? " মিনিট" : " min") })), s.autolock, v => { s.autolock = Number(v); state.autolockAt = 0; applySettings(); markDirty(); });
  optGroup("optLang", Object.keys(I18N).map(k => ({ v: k, label: LANG_NAME[k] })), s.lang, v => { s.lang = v; setLang(v); markDirty(); });
  const f = $("optFont"), z = $("optSize");
  if (f && f.options.length !== 4) {
    [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"], ["bengali", "বাংলা / Bengali"]].forEach(([v, l]) => f.appendChild(mk("option", { value: v, text: l })));
    f.addEventListener("change", () => { state.doc.settings.font = f.value; applySettings(); markDirty(); });
  }
  if (z && z.options.length === 0) {
    [10, 11, 12, 13, 14, 16, 18, 20, 24].forEach(n => z.appendChild(mk("option", { value: String(n), text: n + " pt" })));
    z.addEventListener("change", () => { state.doc.settings.size = Number(z.value); applySettings(); markDirty(); });
  }
  if (f) f.value = s.font;
  if (z) z.value = String(s.size);
  const kt = $("kdfTag");
  if (kt && state.blob) {
    kt.textContent = "PBKDF2 " + num((state.blob.i || 0) / 1000) + "k";
    kt.title = (LANG === "bn" ? "পাসওয়ার্ড থেকে কী প্রাপ্তির পুনরাবৃত্তি সংখ্যা" : "PBKDF2 iterations used to derive the key from your password");
  }
  void settingsBound;
}

/* ---------------------------------------------------------------- error boundary */
function fatalScreen(msgKeyOrText, detail) {
  busyOff();
  const scr = $("fatalScreen");
  $("fatalMsg").textContent = I18N.en[msgKeyOrText] ? t(msgKeyOrText) : (msgKeyOrText || "");
  const d = $("fatalDetail");
  if (detail) { d.style.display = "block"; d.textContent = String(detail).slice(0, 2000); } else d.style.display = "none";
  scr.classList.remove("hidden");
  $("app").classList.add("hidden");
  $("lockScreen").classList.add("hidden");
  $("setupScreen").classList.add("hidden");
}
function installErrorBoundary() {
  window.addEventListener("error", (e) => {
    try {
      if (!state.unlocked) return;
      if (e && e.message) console.error("YaleDoc:", e.message);
      toast(t("err.generic"), "err", {
        label: LANG === "bn" ? "বিস্তারিত" : "Details", keep: true,
        fn: () => alertDlg({ title: t("err.generic"), body: mk("div", { class: "scrollbox mono", text: String(e.message || e) }) })
      });
    } catch (x) { }
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const r = e && e.reason;
      if (r && r.code) return;               /* handled DocError paths report themselves */
      console.error("YaleDoc:", r);
      if (state.unlocked) toast(t("err.generic"), "err");
    } catch (x) { }
  });
  window.addEventListener("beforeunload", (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = t("unsaved.title"); return t("unsaved.title"); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.unlocked && state.dirty) noteActivity();
  });
}
