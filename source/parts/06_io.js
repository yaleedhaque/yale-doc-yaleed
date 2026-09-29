/* ==========================================================================
   YaleDoc v2 — file I/O, imports, command palette, wiring, boot
   ========================================================================== */

/* ---------------------------------------------------------------- serialise */
function buildFileString(blob) {
  const clone = document.documentElement.cloneNode(true);
  const q = (s) => clone.querySelector(s);
  const ed = q("#ydPages"); if (ed) { ed.innerHTML = ""; ed.removeAttribute("style"); ed.removeAttribute("data-empty"); }
  const ti = q("#docTitle"); if (ti) ti.value = "Untitled document";
  ["lockErr", "setupErr", "setupNote", "lockMeta", "stSaved", "unlockTimer", "findQ", "findR", "findCount", "sizeText", "kdfTag", "outlineList", "historyList", "fileList", "busyText", "busySub", "fatalMsg", "fatalDetail"].forEach(id => { const n = q("#" + id); if (n) n.textContent = ""; });
  ["#toasts", "#dlgHost", "#guides", "#slash"].forEach(sel => { const n = q(sel); if (n) n.textContent = ""; });
  ["#app", "#setupScreen", "#lockScreen", "#fatalScreen", "#findbar", "#reading", "#busy", "#dropHint", "#dlgHost"].forEach(sel => { const n = q(sel); if (n) n.classList.add("hidden"); });
  const b = q("#busy"); if (b) b.classList.remove("indet");
  const m = q("#setupMeter"); if (m) m.style.width = "0";
  const app = q("#app"); if (app) app.setAttribute("data-rail", "none");
  clone.querySelectorAll(".rail-panel").forEach(n => n.removeAttribute("data-active"));
  clone.querySelectorAll(".rail-tab").forEach(n => n.setAttribute("aria-selected", "false"));
  /* pristine chrome: no theme, language or geometry leakage before unlock */
  clone.setAttribute("data-theme", "paper");
  clone.setAttribute("data-lang", "en");
  clone.removeAttribute("style");
  const script = q("script#ydPayload");
  if (!script) throw new Error("payload script missing");
  script.textContent = MARK_START + (blob === null ? "null" : JSON.stringify(blob)) + MARK_END;
  return "<!DOCTYPE html>\n" + clone.outerHTML;
}
function getPayloadFromSource(html) {
  const m = /<script[^>]*\bid=["']ydPayload["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html || ""));
  if (!m) return null;
  const t = m[1], i = t.indexOf(MARK_START), j = t.indexOf(MARK_END);
  if (i < 0 || j < 0) return null;
  try { const v = JSON.parse(t.slice(i + MARK_START.length, j)); return (v && typeof v === "object") ? v : null; } catch (e) { return null; }
}
function readPayloadFromNode() {
  const el = document.querySelector("script#ydPayload");
  if (!el) return null;
  const t = el.textContent || "", i = t.indexOf(MARK_START), j = t.indexOf(MARK_END);
  if (i < 0 || j < 0) return null;
  try { const v = JSON.parse(t.slice(i + MARK_START.length, j)); return (v && typeof v === "object") ? v : null; } catch (e) { return null; }
}
function downloadString(text, name, mime) {
  const blob = new Blob([text], { type: mime || "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = mk("a", { href: url, download: name, style: "display:none" });
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 8000);
  return blob.size;
}
function suggestedName() {
  const base = (state.doc.meta.title || "document").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "document";
  return base.endsWith(".ydoc.html") ? base : base + ".ydoc.html";
}

/* ---------------------------------------------------------------- save */
async function makeBlobNow() {
  /* The derived key depends only on (password, salt, iterations) — which are identical
     in v1 and v2 — so an older v1 file re-encrypts into the current format with the SAME
     key. No re-derivation, and the stored cost is preserved rather than reset. */
  const src = state.blob || {};
  let salt = src.s;
  if (typeof salt !== "string" || salt.length < 8) {
    salt = bufToB64(crypto.getRandomValues(new Uint8Array(FMT.saltBytes)));
    const pw = await promptPwd({
      title: LANG === "bn" ? "পাসওয়ার্ড দিন" : "Password required",
      lede: LANG === "bn" ? "এই নথিতে লবণ সংরক্ষিত নেই, তাই নতুন কী তৈরি করতে হবে।" : "This document has no stored salt, so a new key must be derived.",
    });
    if (!pw) return null;
    state.key = await pbkdf2(pw, salt, src.i || FMT.iterDefault);
  }
  const header = { f: FMT.name, v: FMT.v, alg: FMT.alg, kdf: FMT.kdf, i: clamp(Number(src.i) || FMT.iterDefault, 1000, 1e8), s: salt };
  const contentNow = currentContent();
  if (state.lastSavedContent !== undefined && state.lastSavedContent !== contentNow && state.lastSavedContent.length) {
    state.doc.history.unshift({ ts: Date.now(), label: t("snap.auto"), size: state.lastSavedContent.length, content: state.lastSavedContent });
    let budget = FMT.histBudgetBytes;
    while (state.doc.history.length > FMT.histMax || (state.doc.history.reduce((s2, h) => s2 + h.size, 0) > budget && state.doc.history.length > 1)) state.doc.history.pop();
  }
  const doc = {
    v: FMT.v,
    meta: state.doc.meta,
    settings: state.doc.settings,
    content: contentNow,
    attachments: state.doc.attachments,
    history: state.doc.history,
  };
  doc.meta.updated = new Date().toISOString();
  /* keep the in-memory document in step with what was just written, so the next
     save can diff against it and record a real version-history entry */
  state.doc.content = contentNow;
  state.doc.meta.updated = doc.meta.updated;
  return sealWith(state.key, header, doc);
}
async function writeToHandle(handle, text) {
  const w = await handle.createWritable();
  await w.write(text); await w.close();
}
async function ensurePermission(handle, mode) {
  if (!handle || !handle.queryPermission) return true;
  const opts = { mode: mode || "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}
async function saveFile(opts) {
  if (!state.unlocked || !state.key) { toast(t("toast.needDoc"), "err"); return false; }
  if (state.saving) return false;
  state.saving = true;
  setSaveState("saving");
  const stop = busyOn(LANG === "bn" ? "এনক্রিপ্ট করা হচ্ছে…" : "Encrypting…", "", true);
  try {
    const blob = await makeBlobNow();
    if (!blob) { setSaveState(state.dirty ? "dirty" : "clean"); return false; }
    const text = buildFileString(blob);
    const size = new Blob([text]).size;
    if (size > FMT.maxFileBytes) {
      toast(LANG === "bn" ? "ফাইলটি অনেক বড় হয়ে গেছে — কিছু ছবি বা সংযুক্তি সরান।" : "This file would exceed " + bytes(FMT.maxFileBytes) + ". Remove some images or attachments.", "err", { keep: true, label: LANG === "bn" ? "বন্ধ" : "OK", fn: () => { } });
      return false;
    }
    state.blob = blob;
    let written = false;
    if (state.handle && await ensurePermission(state.handle)) {
      try { await writeToHandle(state.handle, text); written = true; state.fileName = state.handle.name || state.fileName; } catch (e) { state.handle = null; }
    }
    if (!written && window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({
          suggestedName: state.fileName || suggestedName(),
          types: [{ description: "YaleDoc encrypted document", accept: { "text/html": [".ydoc.html", ".html"] } }],
        });
        await writeToHandle(h, text);
        state.handle = h; state.fileName = h.name || state.fileName;
        idbPutHandle(h);
        written = true;
      } catch (e) { /* cancelled or unsupported */ }
    }
    if (!written) {
      const name = state.fileName || suggestedName();
      downloadString(text, name);
      state.fileName = name;
      toast(t("toast.savedDl"), "ok", { label: LANG === "bn" ? "ঠিক আছে" : "OK", fn: () => { } });
    } else {
      toast(t("toast.saved") + " · " + bytes(size), "ok");
    }
    state.dirty = false;
    state.lastSavedContent = state.doc.content;
    setSaveState("clean");
    renderSize();
    renderHistory();
    return true;
  } catch (e) {
    console.error(e);
    toast(LANG === "bn" ? "সংরক্ষণ ব্যর্থ" : "Could not save. Your text is still here — try again.", "err", { keep: true, label: LANG === "bn" ? "ঠিক আছে" : "OK", fn: () => { } });
    setSaveState("error");
    return false;
  } finally { stop(); state.saving = false; }
}

/* ---------------------------------------------------------------- snapshot */
function takeSnapshot(label, silent) {
  if (!state.doc) return;
  const content = currentContent();
  const list = state.doc.history;
  list.unshift({ ts: Date.now(), label: label || t("snap.auto"), size: content.length, content: content });
  let budget = FMT.histBudgetBytes;
  while (list.length > FMT.histMax || (list.reduce((s, h) => s + h.size, 0) > budget && list.length > 1)) list.pop();
  if (!silent) { toast(t("snap.taken"), "ok"); renderHistory(); }
}

/* ---------------------------------------------------------------- attachments */
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
function saveAttachment(a) {
  try {
    const bin = atob(a.b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: a.type || "application/octet-stream" }));
    const el = mk("a", { href: url, download: a.name, style: "display:none" });
    document.body.appendChild(el); el.click();
    setTimeout(() => { el.remove(); URL.revokeObjectURL(url); }, 8000);
  } catch (e) { toast(t("err.generic"), "err"); }
}
async function addAttachment(file) {
  if (!state.unlocked) { toast(t("toast.needDoc"), "err"); return; }
  if (!file) return;
  if (file.size > FMT.attMaxBytes) { toast(t("toast.attBig"), "err"); return; }
  if ((state.doc.attachments || []).length >= FMT.attMax) { toast(LANG === "bn" ? "আরও সংযুক্তি যোগ করা যাবে না" : "Attachment limit reached", "err"); return; }
  const stop = busyOn(LANG === "bn" ? "ফাইল যোগ করা হচ্ছে…" : "Encrypting file…", "", true);
  try {
    const buf = await file.arrayBuffer();
    state.doc.attachments.push({ id: "a" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), name: file.name || "file", type: file.type || "application/octet-stream", size: file.size, ts: Date.now(), b64: toBase64(buf) });
    markDirty(); renderFiles(); renderSize();
    toast(t("toast.attAdded"), "ok");
  } catch (e) { toast(t("err.generic"), "err"); } finally { stop(); }
}

/* ---------------------------------------------------------------- markdown import */
function mdToHtml(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const inline = (s) => {
    let t = escHtml(s);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => (/^https?:|mailto:/i.test(u) ? '<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + a + '</a>' : a));
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, u) => (/^https?:|mailto:|^#/i.test(u) ? '<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + a + '</a>' : a));
    t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:)!?])/g, "$1<em>$2</em>");
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    t = t.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
    t = t.replace(/==([^=\n]+)==/g, '<mark class="yhl-1">$1</mark>');
    t = t.replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1");
    return t;
  };
  let i = 0;
  const isUl = (l) => /^\s*[-*+]\s+/.test(l);
  const isOl = (l) => /^\s*\d{1,3}[.)]\s+/.test(l);
  const isTodo = (l) => /^\s*[-*+]\s+\[[ xX]\]\s+/.test(l);
  const content = (l) => l.replace(/^\s*([-*+]|\d{1,3}[.)])\s+/, "").replace(/^\[[ xX]\]\s+/, "");
  const todoState = (l) => (/\[[xX]\]/.test(l) ? "1" : "0");
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { i++; continue; }
    let m;
    if (/^\s*```/.test(l)) {
      const lang = l.trim().slice(3); i++;
      const buf = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push("<pre><code" + (lang ? ' class="lang-' + escHtml(lang.replace(/[^a-z0-9+#-]/gi, "")) + '"' : "") + ">" + escHtml(buf.join("\n")) + "</code></pre>");
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); i++; continue; }
    if (/^\s*(\*\s*){3,}$/.test(l) || /^\s*(-\s*){3,}$/.test(l) || /^\s*_{3,}\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push("<blockquote><p>" + inline(buf.join("\n").replace(/\n/g, "<br>")) + "</p></blockquote>");
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const parseRow = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = parseRow(lines[i]); i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(parseRow(lines[i])); i++; }
      out.push("<table><thead><tr>" + head.map(h => "<th>" + inline(h) + "</th>").join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + head.map((_, k) => "<td>" + inline(r[k] || "") + "</td>").join("") + "</tr>").join("") + "</tbody></table>");
      continue;
    }
    if (isTodo(l) || isUl(l) || isOl(l)) {
      const ordered = isOl(l), todo = isTodo(l);
      const items = [];
      while (i < lines.length && (isTodo(lines[i]) || isUl(lines[i]) || isOl(lines[i]))) {
        items.push({ c: content(lines[i]), d: todoState(lines[i]) });
        i++;
      }
      const lis = items.map(it => todo
        ? '<li data-done="' + it.d + '"><input type="checkbox" contenteditable="false"' + (it.d === "1" ? " checked" : "") + '><div>' + inline(it.c) + "</div></li>"
        : "<li>" + inline(it.c) + "</li>").join("");
      const tag = ordered ? "ol" : "ul";
      out.push("<" + tag + (todo ? ' data-todo="1"' : "") + ">" + lis + "</" + tag + ">");
      continue;
    }
    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^\s*```/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !isUl(lines[i]) && !isOl(lines[i]) && !/^\s*(\*\s*){3,}$/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    if (buf.length) out.push("<p>" + inline(buf.join("\n").replace(/ {2,}$/gm, "<br>").replace(/\n/g, "<br>")) + "</p>");
    else i++;
  }
  return out.join("\n");
}

/* ---------------------------------------------------------------- open / lock */
async function openFile(file) {
  if (!file) return;
  const name = file.name || "document.ydoc.html";
  if (file.size > FMT.maxFileBytes) { toast(LANG === "bn" ? "ফাইলটি অনেক বড়" : "That file is too large", "err"); return; }
  const stop = busyOn(LANG === "bn" ? "ফাইল খোলা হচ্ছে…" : "Reading file…", "", true);
  try {
    const text = await file.text();
    const blob = getPayloadFromSource(text);
    if (!blob) { toast(t("toast.openFail"), "err"); return; }
    validateBlob(blob);
    if (state.unlocked && state.dirty) {
      stop();
      if (!(await confirmDlg({ title: t("unsaved.title"), lede: t("unsaved.body"), okLabel: LANG === "bn" ? "খুলুন" : "Open anyway", danger: true }))) { $("fileInput").value = ""; return; }
    }
    hideAllScreens();
    state.blob = blob; state.doc = null; state.key = null; state.unlocked = false; state.dirty = false;
    state.fileName = name; state.handle = null; state.handleName = name;
    setLockMeta(blob);
    show($("lockScreen"));
    $("lockPw").value = ""; $("lockErr").textContent = "";
    $("lockGo").focus();
  } catch (e) {
    if (e && e.code) { $("lockErr").textContent = t(e.msgKey || "lock.corrupt"); }
    else toast(t("toast.openFail"), "err");
  } finally { stop(); $("fileInput").value = ""; }
}
function setLockMeta(blob) {
  const host = $("lockMeta");
  if (!host) return;
  const rows = [
    ["Format", "YaleDoc v" + (blob.v || "?") + " · " + (blob.alg || "AES-256-GCM")],
    ["Key derivation", "PBKDF2-HMAC-SHA-256 · " + num((blob.i || 0) / 1000) + "k iterations"],
    ["Cipher", "AES-256-GCM · 96-bit random IV per save"],
    ["Size on disk", bytes(estBlobBytes(blob))],
  ];
  host.textContent = "";
  for (const [k, v] of rows) {
    host.appendChild(mk("div", { style: "display:flex;justify-content:space-between;gap:10px;padding:2px 0" }, [
      mk("span", { class: "muted", text: k }), mk("span", { class: "mono nowrap", text: v }),
    ]));
  }
}
function estBlobBytes(blob) {
  try { return (blob.c || "").length * 0.75 + (blob.s || "").length + (blob.n || "").length; } catch (e) { return 0; }
}
function hideAllScreens() { ["#lockScreen", "#setupScreen", "#fatalScreen"].forEach(s => $(s).classList.add("hidden")); }
function show(el) { el.classList.remove("hidden"); }

async function unlockNow() {
  const pw = $("lockPw").value;
  $("lockErr").textContent = "";
  if (!pw) { $("lockErr").textContent = t("pw.empty"); return; }
  const stop = busyOn(LANG === "bn" ? "ডিক্রিপ্ট করা হচ্ছে…" : "Decrypting…", "", true);
  try {
    const { key, doc } = await unlockWith(pw, state.blob);
    state.key = key; state.doc = doc; state.unlocked = true; state.dirty = false;
    $("lockPw").value = "";
    enterEditor();
  } catch (e) {
    $("lockErr").textContent = t(e && e.msgKey ? e.msgKey : "lock.bad");
    $("lockPw").focus(); $("lockPw").select();
    state.key = null; state.doc = null; state.unlocked = false;
  } finally { stop(); }
}
function enterEditor() {
  hideAllScreens();
  $("app").classList.remove("hidden");
  setLang(state.doc.settings.lang || "en");
  loadHtml(state.doc.content);
  state.lastSavedContent = state.doc.content;
  applySettings();
  $("docTitle").value = state.doc.meta.title || DEFAULTS.title;
  setSaveState(state.fileName ? "clean" : "never");
  noteActivity();
  state.autolockAt = state.doc.settings.autolock > 0 ? Date.now() + state.doc.settings.autolock * 60000 : 0;
  renderRailAll(); renderSize(); updateStatus();
  $("canvas").scrollTop = 0;
  requestAnimationFrame(() => { editor().focus(); });
}
function lockNow(msg) {
  if (!state.unlocked) return;
  state.unlocked = false; state.key = null; state.doc = null; state.dirty = false;
  $("app").classList.add("hidden");
  closeReading(); closeFind();
  $("lockPw").value = ""; $("lockErr").textContent = "";
  $("lockGo").focus();
  if (msg) toast(msg, "ok");
}
async function changePassword() {
  if (!state.unlocked) { toast(t("toast.needDoc"), "err"); return; }
  const body = mk("div");
  const oldI = mk("input", { class: "inp", type: "password", autocomplete: "current-password" });
  const n1 = mk("input", { class: "inp", type: "password", autocomplete: "new-password" });
  const n2 = mk("input", { class: "inp", type: "password", autocomplete: "new-password" });
  const meter = mk("i"), note = mk("div", { class: "hint" });
  const mkEye = (inp) => { const e = mk("button", { class: "eye", type: "button", "aria-label": "Show password" }, icon("eye", "ico-20")); e.addEventListener("click", () => { const s = inp.type === "password"; inp.type = s ? "text" : "password"; e.replaceChild(icon(s ? "eye-off" : "eye", "ico-20"), e.firstChild); }); return e; };
  const f1 = mk("div", { class: "field" }, [mk("label", { text: LANG === "bn" ? "বর্তমান পাসওয়ার্ড" : "Current password" }), mk("div", { class: "pwwrap" }, [oldI, mkEye(oldI)])]);
  const f2 = mk("div", { class: "field" }, [mk("label", { text: LANG === "bn" ? "নতুন পাসওয়ার্ড" : "New password" }), mk("div", { class: "pwwrap" }, [n1, mkEye(n1)]), mk("div", { class: "strength" }, meter), note]);
  const f3 = mk("div", { class: "field" }, [mk("label", { text: LANG === "bn" ? "নতুন পাসওয়ার্ড আবার" : "Repeat new password" }), mk("div", { class: "pwwrap" }, [n2, mkEye(n2)])]);
  body.append(f1, f2, f3);
  body.appendChild(mk("p", { class: "note", text: LANG === "bn" ? "নতুন পাসওয়ার্ডে নথিটি পুনরায় এনক্রিপ্ট এবং সংরক্ষিত হবে।" : "The document is re-encrypted with the new password and saved." }));
  n1.addEventListener("input", () => {
    const s = pwScore(n1.value);
    meter.style.width = Math.round(s / 6 * 100) + "%";
    meter.style.background = s <= 2 ? "var(--danger)" : s <= 3 ? "var(--warn)" : "var(--ok)";
    note.textContent = t(pwHintKey(n1.value));
  });
  openDialog({
    title: LANG === "bn" ? "পাসওয়ার্ড বদলান" : "Change password", cls: "narrow", body,
    focus: () => oldI,
    actions: [
      { label: LANG === "bn" ? "বাতিল" : "Cancel" },
      {
        label: LANG === "bn" ? "বদলান ও সংরক্ষণ" : "Change & save", kind: "primary", onClick: async (c) => {
          if (!n1.value || n1.value !== n2.value) { toast(t("pw.match"), "err"); return; }
          if (pwScore(n1.value) < 3) { toast(t("pw.weakBlock"), "err"); return; }
          const stop = busyOn(LANG === "bn" ? "আবার এনক্রিপ্ট হচ্ছে…" : "Re-encrypting…", "", true);
          try {
            /* verify the CURRENT password by actually decrypting the stored blob */
            await unlockWith(oldI.value, state.blob);
            const iters = await calibrateIters();
            const salt = bufToB64(crypto.getRandomValues(new Uint8Array(FMT.saltBytes)));
            const key = await pbkdf2(n1.value, salt, iters);
            state.key = key;
            state.blob = { f: FMT.name, v: FMT.v, alg: FMT.alg, kdf: FMT.kdf, i: iters, s: salt };
            const okSave = await saveFile({ keepHandle: true });
            if (okSave) toast(t("toast.pwChanged"), "ok");
            else toast(LANG === "bn" ? "পাসওয়ার্ড বদলেছে, ফাইলটি সংরক্ষণ করতে হবে।" : "Password changed — save the file to keep it.", "warn", { keep: true });
            c();
          } catch (e) {
            state.key = null;
            toast(e && e.code === "auth" ? t("lock.bad") : t("err.generic"), "err");
          } finally { stop(); }
        }
      },
    ],
  });
}

/* ---------------------------------------------------------------- markdown import dialog */
function importMarkdown() {
  const body = mk("div");
  const ta = mk("textarea", { class: "inp", style: "height:230px;font-family:var(--mono);font-size:12.5px;resize:vertical;line-height:1.55", placeholder: "# Heading\n\nSome **bold** text…" });
  body.appendChild(mk("div", { class: "field" }, [mk("label", { text: LANG === "bn" ? "Markdown লিখুন" : "Paste Markdown" }), ta]));
  const fileIn = mk("input", { type: "file", accept: ".md,.markdown,.txt,text/markdown,text/plain" });
  fileIn.style.display = "none";
  fileIn.addEventListener("change", async () => { const f = fileIn.files[0]; if (f) ta.value = await f.text(); });
  body.appendChild(fileIn);
  openDialog({
    title: LANG === "bn" ? "Markdown আমদানি" : "Import Markdown", cls: "", body,
    lede: LANG === "bn" ? "যা পাস্ট করবেন তা বর্তমান লেখার বদলে যাবে।" : "What you paste replaces the current text.",
    actions: [
      { label: LANG === "bn" ? "ফাইল বেছে নিন" : "Choose file…", onClick: () => fileIn.click() },
      { spacer: true },
      { label: LANG === "bn" ? "বাতিল" : "Cancel" },
      { label: LANG === "bn" ? "আমদানি" : "Import", kind: "primary", onClick: (c) => { if (!ta.value.trim()) { toast(t("err.generic"), "err"); return; } loadHtml(mdToHtml(ta.value)); markDirty(); toast(t("toast.mdImported"), "ok"); c(); } },
    ],
  });
}

/* ---------------------------------------------------------------- indexeddb handle */
function idbOpen() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open("yale-doc-v2", 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbPutHandle(h) {
  try { const db = await idbOpen(); const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(h, "lastFile"); await new Promise(r => setTimeout(r, 60)); db.close(); } catch (e) { }
}
async function idbGetHandle() {
  try {
    const db = await idbOpen();
    const v = await new Promise((res, rej) => { const r = db.transaction("kv", "readonly").objectStore("kv").get("lastFile"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    db.close(); return v || null;
  } catch (e) { return null; }
}
async function idbClear() { try { const db = await idbOpen(); db.transaction("kv", "readwrite").objectStore("kv").delete("lastFile"); db.close(); } catch (e) { } }

/* ---------------------------------------------------------------- command palette */
function commandList() {
  const L = [];
  const add = (id, group, label, hint, fn) => L.push({ id, group, label, hint, fn });
  add("new", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "নতুন নথি" : "New blank document", "Ctrl+N", newDoc);
  add("open", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "ফাইল খুলুন" : "Open a .ydoc file", "Ctrl+O", () => $("fileInput").click());
  add("save", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "সংরক্ষণ" : "Save (encrypted)", "Ctrl+S", () => saveFile());
  add("savecopy", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "কপি সংরক্ষণ" : "Save a copy", "", async () => { const b = await makeBlobNow(); downloadString(buildFileString(b), suggestedName().replace(/\.html?$/i, "") + "-copy.ydoc.html"); toast(t("toast.copied"), "ok"); });
  add("print", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "প্রিন্ট / PDF" : "Print or export PDF", "Ctrl+P", () => window.print());
  add("md.export", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "Markdown রপ্তানি" : "Export as Markdown", ".md", () => { downloadString(toMarkdown(), suggestedName().replace(/\.html?$/i, "") + ".md", "text/markdown;charset=utf-8"); toast(t("toast.mdExported"), "ok"); });
  add("txt.export", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "লেখা রপ্তানি" : "Export as plain text", ".txt", () => { downloadString(toPlainText(), suggestedName().replace(/\.html?$/i, "") + ".txt", "text/plain;charset=utf-8"); toast(t("toast.txtExported"), "ok"); });
  add("md.import", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "Markdown আমদানি" : "Import Markdown", "", importMarkdown);
  add("attach", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "ফাইল সংযুক্ত করুন" : "Attach a file (encrypted)", "", () => $("attInput").click());
  add("lock", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "লক করুন" : "Lock the document now", "Ctrl+L", () => lockNow(t("toast.locked")));
  add("pw.change", LANG === "bn" ? "ফাইল" : "File", LANG === "bn" ? "পাসওয়ার্ড বদলান" : "Change password", "", changePassword);
  add("undo", LANG === "bn" ? "সম্পাদনা" : "Edit", LANG === "bn" ? "পূর্বাবস্থা" : "Undo", "Ctrl+Z", () => exec("undo"));
  add("redo", LANG === "bn" ? "সম্পাদনা" : "Edit", LANG === "bn" ? "পুনরায়" : "Redo", "Ctrl+Shift+Z", () => exec("redo"));
  add("find", LANG === "bn" ? "সম্পাদনা" : "Edit", LANG === "bn" ? "খুঁজুন" : "Find in document", "Ctrl+F", () => openFind(false));
  add("findrep", LANG === "bn" ? "সম্পাদনা" : "Edit", LANG === "bn" ? "খুঁজে বদলান" : "Find and replace", "Ctrl+H", () => openFind(true));
  add("clear", LANG === "bn" ? "সম্পাদনা" : "Edit", LANG === "bn" ? "ফরম্যাট মুছুন" : "Clear formatting", "", () => exec("removeFormat"));
  add("selectall", LANG === "bn" ? "সম্পাদনা" : "Edit", LANG === "bn" ? "সব নির্বাচন" : "Select all", "Ctrl+A", () => { focusEditorAtEnd(); document.execCommand("selectAll", false, null); });
  add("h1", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "শিরোনাম ১" : "Heading 1", "Ctrl+1", () => blockFmt("h1"));
  add("h2", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "শিরোনাম ২" : "Heading 2", "Ctrl+2", () => blockFmt("h2"));
  add("h3", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "শিরোনাম ৩" : "Heading 3", "Ctrl+3", () => blockFmt("h3"));
  add("p", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "অনুচ্ছেদ" : "Paragraph", "Ctrl+0", () => blockFmt("p"));
  add("quote", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "উদ্ধৃতি" : "Block quote", "", () => blockFmt("blockquote"));
  add("code", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "কোড ব্লক" : "Code block", "", () => blockFmt("pre"));
  add("ul", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "বুলেট তালিকা" : "Bulleted list", "", () => exec("insertUnorderedList"));
  add("ol", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "সংখ্যা তালিকা" : "Numbered list", "", () => exec("insertOrderedList"));
  add("todo", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "খোঁজা খবর" : "To-do list", "", toggleTodo);
  add("link", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "লিংক" : "Insert link", "Ctrl+K", linkDialog);
  add("image", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "ছবি" : "Insert image", "", () => $("imgInput").click());
  add("table", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "টেবিল" : "Insert table", "", () => tablePicker());
  add("rule", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "রেখা" : "Horizontal rule", "", () => exec("insertHorizontalRule"));
  add("page", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "পাতা ভাঙা" : "Page break", "Ctrl+Enter", insertPageBreak);
  add("color", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "লেখার রং" : "Text colour", "", () => swatchDialog("color"));
  add("hl", LANG === "bn" ? "ফরম্যাট" : "Format", LANG === "bn" ? "হাইলাইট" : "Highlight", "", () => swatchDialog("highlight"));
  add("focus", LANG === "bn" ? "দৃশ্য" : "View", LANG === "bn" ? "ফোকাস মোড" : "Focus mode", "Ctrl+Shift+F", () => toggleFocusMode());
  add("read", LANG === "bn" ? "দৃশ্য" : "View", LANG === "bn" ? "পঠন মোড" : "Reading mode", "Ctrl+Shift+R", openReading);
  add("zoomin", LANG === "bn" ? "দৃশ্য" : "View", LANG === "bn" ? "বড় করুন" : "Zoom in", "Ctrl++", () => setZoom((sget("zoom", 1)) + 0.1));
  add("zoomout", LANG === "bn" ? "দৃশ্য" : "View", LANG === "bn" ? "ছোট করুন" : "Zoom out", "Ctrl+-", () => setZoom((sget("zoom", 1)) - 0.1));
  add("zoomreset", LANG === "bn" ? "দৃশ্য" : "View", LANG === "bn" ? "আসল আকার" : "Reset zoom", "Ctrl+0", () => setZoom(1));
  add("guides", LANG === "bn" ? "দৃশ্য" : "View", LANG === "bn" ? "পাতার সীমানা দেখান" : "Toggle page guides", "", () => { state.doc.settings.guides = !state.doc.settings.guides; applySettings(); markDirty(); });
  add("theme.paper", LANG === "bn" ? "চেহারা" : "Look", LANG === "bn" ? "থিম: পেপার" : "Theme: paper (light)", "", () => { state.doc.settings.theme = "paper"; applySettings(); markDirty(); });
  add("theme.ink", LANG === "bn" ? "চেহারা" : "Look", LANG === "bn" ? "থিম: কালি" : "Theme: ink (dark)", "", () => { state.doc.settings.theme = "ink"; applySettings(); markDirty(); });
  add("theme.sepia", LANG === "bn" ? "চেহারা" : "Look", LANG === "bn" ? "থিম: সেপিয়া" : "Theme: sepia", "", () => { state.doc.settings.theme = "sepia"; applySettings(); markDirty(); });
  add("keys", LANG === "bn" ? "সাহায্য" : "Help", LANG === "bn" ? "কিবোর্ড শর্টকাট" : "Keyboard shortcuts", "?", shortcutsDialog);
  add("about", LANG === "bn" ? "সাহায্য" : "Help", LANG === "bn" ? "এই ফাইল সম্পর্কে" : "About this file", "", aboutDialog);
  return L;
}
function openPalette() {
  if (!state.unlocked) { toast(t("toast.needDoc"), "err"); return; }
  const all = commandList();
  let items = all, sel = 0, q = "";
  const list = mk("div", { class: "pal-list", role: "listbox" });
  const inp = mk("input", { type: "text", placeholder: LANG === "bn" ? "কমান্ড খুঁজুন\u2026" : "Type a command\u2026", spellcheck: "false", "aria-label": LANG === "bn" ? "কমান্ড" : "Command" });
  const body = mk("div", {}, [mk("div", { class: "pal-in" }, [icon("zap", "ico-20"), inp]), list]);
  const dlg = openDialog({
    title: null, cls: "wide", noClose: true, noEsc: true, noDismiss: true,
    body, actions: [], focus: () => inp,
  });
  dlg.dlg.style.padding = "0"; dlg.dlg.style.overflow = "hidden";
  const paint = () => {
    const nodes = list.querySelectorAll(".pal-item");
    nodes.forEach((n, i) => {
      n.setAttribute("data-sel", String(i === sel));
      n.setAttribute("aria-selected", String(i === sel));
      if (i === sel) n.scrollIntoView({ block: "nearest" });
    });
  };
  const run = (i) => { const c = items[i]; if (!c) return; dlg.close(); document.removeEventListener("keydown", onKey, true); try { c.fn(); } catch (e) { console.error(e); } };
  const render = () => {
    list.textContent = "";
    const ql = q.trim().toLowerCase();
    const toks = ql ? ql.split(/\s+/).filter(Boolean) : [];
    items = toks.length ? all.filter(c => {
      const hay = (c.label + " " + c.id + " " + (c.hint || "")).toLowerCase();
      return toks.every(tok => hay.indexOf(tok) !== -1);
    }) : all;
    if (!items.length) { list.appendChild(mk("div", { class: "pal-empty", text: LANG === "bn" ? "কিছু মেলেনি" : "No matching command" })); return; }
    let group = null;
    items.forEach((c) => {
      if (c.group !== group) { group = c.group; list.appendChild(mk("div", { class: "pal-group", text: group })); }
      const b = mk("button", { class: "pal-item", type: "button", role: "option" }, [
        mk("span", { class: "nm", text: c.label }), mk("span", { class: "hint", text: c.hint || "" }),
      ]);
      b.addEventListener("click", () => run(items.indexOf(c)));
      b.addEventListener("mousemove", () => { sel = items.indexOf(c); paint(); });
      list.appendChild(b);
    });
    paint();
  };
  function onKey(e) {
    if (openStack[openStack.length - 1] !== dlg) return;
    if (e.key === "Escape") { e.preventDefault(); dlg.close(); document.removeEventListener("keydown", onKey, true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); run(sel); }
  }
  inp.addEventListener("input", () => { q = inp.value; sel = 0; render(); });
  document.addEventListener("keydown", onKey, true);
  render();
  setTimeout(() => inp.focus(), 20);
  return dlg;
}
function shortcutsDialog() {
  const rows = [
    ["Ctrl + S", LANG === "bn" ? "এনক্রিপ্ট করে সংরক্ষণ" : "Encrypt and save"],
    ["Ctrl + K", LANG === "bn" ? "কমান্ড খুঁজুন" : "Command palette (also: insert link with text selected)"],
    ["Ctrl + F", LANG === "bn" ? "খুঁজুন" : "Find"], ["Ctrl + H", LANG === "bn" ? "খুঁজে বদলান" : "Find and replace"],
    ["Ctrl + B / I / U", LANG === "bn" ? "গাঢ় / বাঁক / নিম্নরেখা" : "Bold / italic / underline"],
    ["Ctrl + 1 / 2 / 3", LANG === "bn" ? "শিরোনাম" : "Heading 1 / 2 / 3"],
    ["Ctrl + Enter", LANG === "bn" ? "পাতা ভাঙা" : "Page break"],
    ["Tab / Shift + Tab", LANG === "bn" ? "ইন্ডেন্ট" : "Indent / outdent (in lists)"],
    ["# + space", LANG === "bn" ? "শিরোনাম" : "Heading (Markdown shortcut)"],
    ["> + space", LANG === "bn" ? "উদ্ধৃতি" : "Blockquote (Markdown shortcut)"],
    ["- + space", LANG === "bn" ? "তালিকা" : "Bulleted list (Markdown shortcut)"],
    ["1. + space", LANG === "bn" ? "সংখ্যা তালিকা" : "Numbered list (Markdown shortcut)"],
    ["[] + space", LANG === "bn" ? "খোঁজা খবর" : "To-do item (Markdown shortcut)"],
    ["**text**", LANG === "bn" ? "গাঢ়" : "Bold as you type"], ["*text*", LANG === "bn" ? "বাঁক" : "Italic as you type"],
    ["`code`", LANG === "bn" ? "কোড" : "Inline code as you type"], ["/ ", LANG === "bn" ? "সেভাব চিহ্ন" : "Insert-menu"],
    ["Ctrl + L", LANG === "bn" ? "লক" : "Lock now"], ["Ctrl + Shift + F", LANG === "bn" ? "ফোকাস মোড" : "Focus mode"],
    ["Ctrl + Shift + R", LANG === "bn" ? "পঠন মোড" : "Reading mode"],
    ["Ctrl + \\", LANG === "bn" ? "সাইড প্যানেল" : "Side panel"],
  ];
  const grid = mk("div", { class: "kbdlist" });
  for (const [k, d] of rows) { grid.appendChild(mk("span", { class: "kbd", text: k })); grid.appendChild(mk("span", { class: "desc", text: d })); }
  openDialog({ title: LANG === "bn" ? "কিবোর্ড শর্টকাট" : "Keyboard shortcuts", body: grid });
}
function aboutDialog() {
  const b = state.blob || {};
  const body = mk("div");
  const rows = [
    ["Format", "YaleDoc v" + (b.v || "?")],
    ["Cipher", b.alg || "AES-256-GCM"],
    ["Key derivation", (b.kdf || "pbkdf2-sha256") + " · " + num((b.i || 0) / 1000) + "k"],
    ["Document created", b.v >= 2 ? (state.doc && state.doc.meta.created ? stamp(state.doc.meta.created) : "—") : "—"],
    ["File name", state.fileName || "—"],
    ["Editor size on disk", bytes(estPayloadBytes())],
    ["Network", LANG === "bn" ? "বন্ধ (CSP default-src 'none')" : "Blocked by policy (CSP default-src 'none')"],
  ];
  for (const [k, v] of rows) body.appendChild(mk("div", { style: "display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--line-2)" }, [mk("span", { class: "muted", text: k }), mk("span", { class: "mono nowrap", text: String(v) })]));
  body.appendChild(mk("p", { class: "note", style: "margin-top:12px", text: LANG === "bn" ? "এই ফাইলে কোনো নেটওয়ার্ক অনুরোধ নেই। সব এনক্রিপশন এই ডিভাইসেই ঘটে।" : "This file makes no network requests of any kind. All encryption happens on this device." }));
  openDialog({ title: LANG === "bn" ? "এই ফাইল সম্পর্কে" : "About this file", body });
}

/* ---------------------------------------------------------------- new doc */
async function createWithPassword(pw) {
  const stop = busyOn(LANG === "bn" ? "নথি তৈরি হচ্ছে…" : "Creating document…", "", true);
  try {
    const iters = await calibrateIters();
    const salt = bufToB64(crypto.getRandomValues(new Uint8Array(FMT.saltBytes)));
    state.key = await pbkdf2(pw, salt, iters);
    state.blob = { f: FMT.name, v: FMT.v, alg: FMT.alg, kdf: FMT.kdf, i: iters, s: salt };
    state.doc = newDoc0();
    state.unlocked = true; state.dirty = false; state.fileName = null; state.handle = null; state.lastSavedContent = "";
    enterEditor(); setSaveState("never");
    return true;
  } catch (e) { toast(t("err.generic"), "err"); return false; } finally { stop(); }
}
async function newDoc() {
  if (state.unlocked && state.dirty) {
    if (!(await confirmDlg({ title: t("unsaved.title"), lede: t("unsaved.body"), okLabel: LANG === "bn" ? "নতুন নথি" : "New document", danger: true }))) return;
  }
  const pw = await promptPwd({
    title: LANG === "bn" ? "নতুন নথি" : "New encrypted document",
    lede: LANG === "bn" ? "নতুন নথির পাসওয়ার্ড দিন।" : "Choose a password for the new document.",
    okLabel: LANG === "bn" ? "তৈরি করুন" : "Create", showMeter: true,
  });
  if (!pw) return;
  if (pwScore(pw) < 3) { toast(t("pw.weakBlock"), "err"); return; }
  if (await createWithPassword(pw)) {
    toast(LANG === "bn" ? "নথি তৈরি হয়েছে — Ctrl+S দিয়ে সংরক্ষণ করুন।" : "Document created. Press Ctrl+S to save it.", "ok", { keep: true, label: LANG === "bn" ? "সংরক্ষণ" : "Save", fn: () => saveFile() });
  }
}
function newDoc0() {
  const now = new Date().toISOString();
  return { v: FMT.v, meta: { title: DEFAULTS.title, created: now, updated: now, app: "yale-doc/2" }, settings: Object.assign({}, DEFAULTS, { lang: LANG }), content: "", attachments: [], history: [] };
}

/* ---------------------------------------------------------------- wiring */
function wireAll() {
  /* password eyes */
  document.querySelectorAll("[data-eyes]").forEach(b => {
    b.addEventListener("click", () => {
      const i = $(b.dataset.eyes);
      const show = i.type === "password";
      i.type = show ? "text" : "password";
      b.replaceChild(icon(show ? "eye-off" : "eye", "ico-20"), b.firstChild);
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
      i.focus();
    });
  });
  /* lock screen */
  $("lockGo").addEventListener("click", unlockNow);
  $("lockPw").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); unlockNow(); } });
  $("lockPw").addEventListener("input", () => { $("lockErr").textContent = ""; });
  /* setup screen */
  $("setupPw").addEventListener("input", () => paintStrength("setupPw", "setupMeter", "setupNote"));
  $("setupPw2").addEventListener("input", () => { $("setupErr").textContent = ""; });
  $("setupGo").addEventListener("click", async () => {
    const a = $("setupPw").value, b = $("setupPw2").value;
    $("setupErr").textContent = "";
    if (!a) { $("setupErr").textContent = t("pw.empty"); return; }
    if (a !== b) { $("setupErr").textContent = t("pw.match"); return; }
    if (pwScore(a) < 3) { $("setupErr").textContent = t("pw.weakBlock"); return; }
    $("setupPw").value = ""; $("setupPw2").value = "";
    await createWithPassword(a);
  });
  $("setupPw2").addEventListener("keydown", e => { if (e.key === "Enter") $("setupGo").click(); });
  $("setupLearn").addEventListener("click", async (e) => {
    e.preventDefault();
    await alertDlg({
      title: LANG === "bn" ? "পাসওয়ার্ড কীভাবে বাছবেন" : "Choosing a password",
      body: mk("div", {}, [
        mk("p", { class: "lede", text: LANG === "bn" ? "YaleDoc প্রতিবার সংরক্ষণে নতুন IV দিয়ে AES-256-GCM ব্যবহার করে এবং পাসওয়ার্ড থেকে কী তৈরি করে।" : "YaleDoc derives a key from your password with PBKDF2-HMAC-SHA-256, then encrypts with AES-256-GCM using a fresh random IV on every save." }),
        mk("ul", { style: "margin:0 0 10px;padding-left:1.2em;line-height:1.7" }, [
          mk("li", { text: LANG === "bn" ? "কমপক্ষে ১২–১৫ অক্ষর, যত বেশি তত ভালো।" : "Use 12–15 characters or more. Length matters more than symbols." }),
          mk("li", { text: LANG === "bn" ? "একটি বাক্য ব্যবহার করুন — মনে রাখা সহজ, অনুমান কঠিন।" : "A short sentence you will remember beats a short word you will not." }),
          mk("li", { text: LANG === "bn" ? "অন্য সাইটের পাসওয়ার্ড ব্যবহার করবেন না।" : "Never reuse a password from another site." }),
        ]),
        mk("p", { class: "note", text: LANG === "bn" ? "পাসওয়ার্ড ভুলে গেলে কোনো পুনরুদ্ধার নেই — কোনো সার্ভারে কোনো কপি নেই।" : "There is no recovery: there is no server and no copy anywhere." }),
      ]),
    });
  });
  /* file inputs */
  const fi = mk("input", { type: "file", accept: ".ydoc.html,.html,.htm,text/html", class: "hidden", id: "fileInput" });
  const ii = mk("input", { type: "file", accept: "image/*", class: "hidden", id: "imgInput" });
  const ai = mk("input", { type: "file", class: "hidden", id: "attInput" });
  document.body.append(fi, ii, ai);
  fi.addEventListener("change", e => { const f = e.target.files[0]; if (f) openFile(f); });
  ii.addEventListener("change", e => { const f = e.target.files[0]; if (f) insertImage(f); e.target.value = ""; });
  ai.addEventListener("change", e => { const f = e.target.files[0]; if (f) addAttachment(f); e.target.value = ""; });
  /* toolbar */
  $("bNew").addEventListener("click", newDoc);
  $("bOpen").addEventListener("click", () => fi.click());
  $("bSave").addEventListener("click", () => saveFile());
  $("bSaveCopy").addEventListener("click", async () => { const b = await makeBlobNow(); downloadString(buildFileString(b), suggestedName().replace(/\.html?$/i, "") + "-copy.ydoc.html"); toast(t("toast.copied"), "ok"); });
  $("bPrint").addEventListener("click", () => window.print());
  $("bUndo").addEventListener("click", () => exec("undo"));
  $("bRedo").addEventListener("click", () => exec("redo"));
  $("bBold").addEventListener("click", () => exec("bold"));
  $("bItalic").addEventListener("click", () => exec("italic"));
  $("bUnder").addEventListener("click", () => exec("underline"));
  $("bStrike").addEventListener("click", () => exec("strikeThrough"));
  $("bSup").addEventListener("click", () => exec("superscript"));
  $("bSub").addEventListener("click", () => exec("subscript"));
  [["bH1", "h1"], ["bH2", "h2"], ["bH3", "h3"], ["bP", "p"], ["bQuote", "blockquote"], ["bCode", "pre"]].forEach(([id, tag]) => {
    $(id).addEventListener("mousedown", e => e.preventDefault());
    $(id).addEventListener("click", () => blockFmt(tag));
  });
  $("bUl").addEventListener("click", () => exec("insertUnorderedList"));
  $("bOl").addEventListener("click", () => exec("insertOrderedList"));
  $("bTodo").addEventListener("click", toggleTodo);
  $("bTable").addEventListener("click", () => tablePicker());
  [["bAl", "left"], ["bAc", "center"], ["bAr", "right"], ["bAj", "justify"]].forEach(([id, m]) => {
    $(id).addEventListener("mousedown", e => e.preventDefault());
    $(id).addEventListener("click", () => applyAlign(m));
  });
  $("bInd").addEventListener("click", () => setIndent(1));
  $("bOutd").addEventListener("click", () => setIndent(-1));
  $("bLink").addEventListener("mousedown", e => e.preventDefault());
  $("bLink").addEventListener("click", linkDialog);
  $("bImg").addEventListener("click", () => ii.click());
  $("bColor").addEventListener("click", () => swatchDialog("color"));
  $("bHl").addEventListener("click", () => swatchDialog("highlight"));
  $("bHr").addEventListener("click", () => exec("insertHorizontalRule"));
  $("bPageBreak").addEventListener("click", insertPageBreak);
  $("bClear").addEventListener("click", () => { focusEditorAtEnd(); document.execCommand("removeFormat", false, null); afterCommand(); });
  $("bCmd").addEventListener("click", openPalette);
  $("bRailSettings").addEventListener("click", () => setRail("settings"));
  /* top bar */
  $("railBtn").addEventListener("click", () => setRail($("app").dataset.rail === "none" ? "outline" : "none"));
  $("findBtn").addEventListener("click", () => openFind(false));
  $("readBtn").addEventListener("click", openReading);
  $("readClose").addEventListener("click", closeReading);
  $("lockBtn").addEventListener("click", () => lockNow(t("toast.locked")));
  $("bChangePw2").addEventListener("click", changePassword);
  $("docTitle").addEventListener("input", () => { if (state.doc) { state.doc.meta.title = $("docTitle").value.slice(0, 200) || DEFAULTS.title; markDirty(); } });
  $("docTitle").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); editor().focus(); } });
  /* rail */
  document.querySelectorAll(".rail-tab").forEach(b => b.addEventListener("click", () => {
    setRail(b.dataset.pane);
    if (window.innerWidth <= 760) $("railScrim").classList.remove("hidden");
  }));
  $("railScrim").addEventListener("click", () => { $("railScrim").classList.add("hidden"); if (window.innerWidth <= 760) $("app").dataset.rail = "none"; });
  $("snapNow").addEventListener("click", () => takeSnapshot(null, false));
  $("attAdd").addEventListener("click", () => ai.click());
  /* find */
  $("findQ").addEventListener("input", debounce(runFind, 140));
  $("findR").addEventListener("input", () => { find.r = $("findR").value; });
  $("findQ").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? findJump(find.cur - 1) : findJump(find.cur + 1); }
    if (e.key === "Escape") { e.preventDefault(); closeFind(); }
  });
  $("findR").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.ctrlKey ? $("findAll").click() : findReplaceCurrent(); } });
  $("findPrev").addEventListener("click", () => findJump(find.cur - 1));
  $("findNext").addEventListener("click", () => findJump(find.cur + 1));
  $("findRepl").addEventListener("click", findReplaceCurrent);
  $("findAll").addEventListener("click", () => { const n = findReplaceAll(); if (n) toast(num(n) + " " + t("find.n"), "ok"); });
  $("findClose").addEventListener("click", closeFind);
  /* editor */
  const ed = editor();
  ed.addEventListener("input", () => {
    ed.setAttribute("data-empty", ed.textContent === "" && !ed.querySelector("img,hr,table") ? "true" : "false");
    updateStatus(); markDirty(); noteActivity(); syncToolbar();
    showSlash();
    normaliseTodoLists();
    if (maybeBlockShortcut()) return;
    maybeInlineShortcut();
  });
  ed.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type && it.type.startsWith("image/")) { e.preventDefault(); const f = it.getAsFile(); if (f) insertImage(f); return; }
    }
    /* let the browser insert, then scrub synchronously via a microtask guard */
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html) document.execCommand("insertHTML", false, sanitizeHTML(html));
    else if (text) document.execCommand("insertText", false, text);
    afterCommand();
  });
  ed.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (/^image\//.test(f.type)) insertImage(f);
    else if (/\.ya?doc\.html?$/i.test(f.name)) openFile(f);
    else addAttachment(f);
  });
  ed.addEventListener("keydown", onEditorKey);
  document.addEventListener("selectionchange", () => { if (state.unlocked) { syncToolbar(); updatePill(); } });
  $("canvas").addEventListener("scroll", rafThrottle(updatePill), { passive: true });
  window.addEventListener("resize", rafThrottle(() => { drawGuides(); updatePill(); }));
  ["mousemove", "keydown", "touchstart", "pointerdown"].forEach(ev => document.addEventListener(ev, noteActivity, { passive: true }));
  document.addEventListener("keydown", onGlobalKey);
  /* drag & drop a whole file onto the window */
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) { dragDepth++; $("dropHint").classList.add("on"); } });
  window.addEventListener("dragover", (e) => { if ($("dropHint").classList.contains("on")) e.preventDefault(); });
  window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("dropHint").classList.remove("on"); });
  window.addEventListener("drop", (e) => {
    dragDepth = 0; $("dropHint").classList.remove("on");
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    const f = e.dataTransfer.files[0];
    if (state.unlocked && e.target !== editor() && !ed.contains(e.target)) {
      e.preventDefault();
      if (/\.ya?doc\.html?$/i.test(f.name)) openFile(f);
      else if (/^image\//.test(f.type)) insertImage(f);
      else addAttachment(f);
    }
  });
  $("fatalCopy").addEventListener("click", async () => { await copyToClipboard($("fatalDetail").textContent || $("fatalMsg").textContent); toast(t("toast.copy"), "ok"); });
  $("fatalReload").addEventListener("click", () => location.reload());
}
function onEditorKey(e) {
  if (!state.unlocked) return;
  const mod = e.ctrlKey || e.metaKey;
  if (slashState) {
    if (e.key === "ArrowDown") { e.preventDefault(); slashMove(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); slashMove(-1); return; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); runSlash(slashState.sel); return; }
    if (e.key === "Escape") { e.preventDefault(); hideSlash(); return; }
  }
  if (e.key === "Tab" && !e.shiftKey && !mod) {
    const b = caretBlock();
    if (b && (b.tagName === "LI" || b.closest("li"))) { e.preventDefault(); setIndent(1); return; }
    if (b && b.tagName === "TD") { e.preventDefault(); focusNextCell(b, 1); return; }
  }
  if (e.key === "Tab" && e.shiftKey) {
    const b = caretBlock();
    if (b && b.tagName === "TD") { e.preventDefault(); focusNextCell(b, -1); return; }
    if (b && (b.tagName === "LI" || b.closest("li"))) { e.preventDefault(); setIndent(-1); return; }
  }
  if (e.key === "Enter" && !mod) {
    if (slashState) { e.preventDefault(); runSlash(slashState.sel); return; }
    const b = caretBlock();
    const li = b ? b.closest("li") : null;
    if (li && li.parentElement && li.parentElement.hasAttribute("data-todo")) {
      /* build the new to-do row ourselves: letting the browser insert a bare <li>
         puts the typed text outside the checkbox / text-div structure */
      e.preventDefault();
      const box = mk("input", { type: "checkbox", contenteditable: "false" });
      box.setAttribute("data-done", "0");
      const wrap = mk("div");
      wrap.appendChild(document.createElement("br"));
      const nl = mk("li", { "data-done": "0" });
      nl.appendChild(box); nl.appendChild(wrap);
      li.after(nl);
      const g = getSelection();
      try { g.setBaseAndExtent(wrap, 0, wrap, 0); } catch (e) { }
      afterCommand();
      return;
    }
    if (b && b.tagName === "PRE" && !e.shiftKey) { e.preventDefault(); document.execCommand("insertLineBreak", false, null); afterCommand(); return; }
  }
  if (e.key === "Backspace" && !mod) {
    const b = caretBlock();
    if (b && b.tagName === "LI") {
      const li = b.closest("li");
      if (li && !li.textContent.trim() && !li.querySelector("img")) { e.preventDefault(); const next = li.nextElementSibling || li.previousElementSibling; li.remove(); afterCommand(); if (next) focusNode(next); return; }
    }
  }
}
function focusNextCell(cell, dir) {
  const row = cell.parentElement, table = row.closest("table");
  if (!table) return;
  const cells = Array.prototype.slice.call(row.cells);
  const i = cells.indexOf(cell);
  const j = i + dir;
  if (j >= 0 && j < cells.length) { focusNode(cells[j]); return; }
  const rows = Array.prototype.slice.call(table.rows);
  const ri = rows.indexOf(row);
  const nrow = rows[ri + dir];
  if (nrow && nrow.cells.length) focusNode(nrow.cells[dir > 0 ? 0 : nrow.cells.length - 1]);
}
function onGlobalKey(e) {
  if (!state.unlocked) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "s") { e.preventDefault(); saveFile(); return; }
  if (mod && k === "f" && !e.shiftKey) { e.preventDefault(); openFind(false); return; }
  if (mod && k === "h") { e.preventDefault(); openFind(true); return; }
  if (mod && k === "l" && !e.shiftKey) { e.preventDefault(); lockNow(t("toast.locked")); return; }
  if (mod && k === "p") { e.preventDefault(); window.print(); return; }
  if (mod && k === "\\") { e.preventDefault(); setRail($("app").dataset.rail === "none" ? "outline" : "none"); return; }
  if (mod && e.shiftKey && k === "f") { e.preventDefault(); toggleFocusMode(); return; }
  if (mod && e.shiftKey && k === "r") { e.preventDefault(); openReading(); return; }
  if (mod && e.shiftKey && k === "z") { e.preventDefault(); exec("redo"); return; }
  if (mod && k === "=") { e.preventDefault(); setZoom((sget("zoom", 1)) + 0.1); return; }
  if (mod && k === "+") { e.preventDefault(); setZoom((sget("zoom", 1)) + 0.1); return; }
  if (mod && k === "-") { e.preventDefault(); setZoom((sget("zoom", 1)) - 0.1); return; }
  if (mod && k === "0") { e.preventDefault(); setZoom(1); return; }
  if (e.key === "Escape") {
    if (slashState) { hideSlash(); return; }
    if (!$("reading").classList.contains("on") && $("app").dataset.rail !== "none" && window.innerWidth <= 760) { $("app").dataset.rail = "none"; $("railScrim").classList.add("hidden"); return; }
  }
  if (e.key === "?" && !mod && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); shortcutsDialog(); }
}

/* ---------------------------------------------------------------- autolock */
function autolockTick() {
  if (!state.unlocked || !state.doc) return;
  const al = state.doc.settings.autolock;
  if (!al) return;
  if (Date.now() > state.autolockAt) { lockNow(t("toast.locked")); }
}

/* ---------------------------------------------------------------- boot */
function boot() {
  const blob = readPayloadFromNode();
  if (blob) {
    state.blob = blob;
    state.fileName = null;
    try { validateBlob(blob); } catch (e) {
      fatalScreen(e && e.msgKey ? e.msgKey : "lock.corrupt", e && e.code ? "format-check: " + e.code : "");
      return;
    }
    setLockMeta(blob);
    show($("lockScreen"));
    setTimeout(() => $("lockPw").focus(), 60);
    /* offer to reopen the last file, where the browser remembers it */
    if (window.showSaveFilePicker) {
      idbGetHandle().then(async (h) => {
        if (!h) return;
        const det = $("lockDet");
        if (!det) return;
        const row = mk("div", { style: "display:flex;align-items:center;gap:9px;padding:7px 0;margin-top:6px" }, [
          mk("span", { class: "sub", style: "flex:1", text: LANG === "bn" ? "গতবারের ফাইল খুলবেন?" : "Reopen your last document?" }),
          mk("button", {
            class: "chipbtn", type: "button", text: h.name || (LANG === "bn" ? "খুলুন" : "Open"), onclick: async (e) => {
              e.preventDefault();
              try {
                if (await ensurePermission(h, "read")) { const f = await h.getFile(); state.handle = null; openFile(f); state.handle = h; }
                else { $("fileInput").click(); }
              } catch (err) { $("fileInput").click(); }
            }
          }),
          mk("button", { class: "chipbtn", type: "button", text: LANG === "bn" ? "বাদ" : "No", onclick: (e) => { e.preventDefault(); row.remove(); idbClear(); } }),
        ]);
        det.appendChild(row);
      });
    }
  } else {
    show($("setupScreen"));
    setTimeout(() => $("setupPw").focus(), 60);
  }
}
function init() {
  installErrorBoundary();
  initPill();
  wireAll();
  applyI18n();
  setZoom(sget("zoom", 1));
  if (!hasWebCrypto) {
    fatalScreen("lock.badkdf", "crypto.subtle is unavailable. This usually means the page is not in a secure context (it must be opened as a local file, not inside a sandboxed frame).");
    return;
  }
  if (!window.CSS || !CSS.supports || !CSS.supports("color", "color-mix(in srgb, red 10%, blue)")) {
    document.documentElement.style.setProperty("--accent-soft", "rgba(180,82,47,.12)");
  }
  if (!window.indexedDB) { /* optional: only the reopen shortcut is lost */ }
  setInterval(autolockTick, 5000);
  /* Page guides are measured from real layout. A rAF-throttled measurement can run
     before an engine has laid the new content out (WebKit on a narrow viewport read
     every block height as 0), so observe the page box itself: this fires after
     layout in every engine and keeps the guide count honest. */
  if (window.ResizeObserver) {
    try { new ResizeObserver(scheduleGuides).observe(editor()); } catch (e) { }
  }
  try { boot(); } catch (e) { fatalScreen("err.generic", (e && e.stack) || String(e)); }
}

/* ---------------------------------------------------------------- test hooks */
window.__yd = {
  FMT, state,
  buildFileString, getPayloadFromSource, readPayloadFromNode,
  sanitizeHTML, normalizeFormatting, currentContent, loadHtml,
  unlockWith, sealWith, pbkdf2, calibrateIters, validateBlob, aadOf, migrate, newDoc0,
  mdToHtml, toMarkdown, toPlainText, saveFile, makeBlobNow, openFile, lockNow, unlockNow,
  takeSnapshot, runFind, find, closeFind, exec, blockFmt, applyAlign, insertTable, insertImage,
  toggleTodo, maybeBlockShortcut, maybeInlineShortcut, setIndent, showSlash, hideSlash, insertPageBreak,
  setZoom, openPalette, commandList, openDialog, toast, t, setLang, markDirty, updateStatus,
  applySettings, drawGuides, setRail, renderOutline, estPayloadBytes, buildTest: (pw, content, settings) => makePayloadFor(pw, content, settings),
};
async function makePayloadFor(password, content, settings) {
  const iters = 150000;
  const salt = bufToB64(crypto.getRandomValues(new Uint8Array(FMT.saltBytes)));
  const key = await pbkdf2(password, salt, iters);
  const header = { f: FMT.name, v: FMT.v, alg: FMT.alg, kdf: FMT.kdf, i: iters, s: salt };
  const doc = { v: FMT.v, meta: { title: "Test", created: new Date().toISOString(), updated: new Date().toISOString(), app: "yale-doc/2" }, settings: Object.assign({}, DEFAULTS, settings || {}), content: content, attachments: [], history: [] };
  return { key, doc, blob: await sealWith(key, header, doc), header };
}

init();
</script>
</body>
</html>
