/* ==========================================================================
   YaleDoc v2 — core: constants, i18n, utilities, crypto, format, sanitizer
   ========================================================================== */

/* ---------------------------------------------------------------- format */
const FMT = Object.freeze({
  name: "yale-doc",
  v: 2, minV: 1, maxV: 2,
  kdf: "PBKDF2-HMAC-SHA256",
  kdfV1: "pbkdf2-sha256",
  alg: "AES-256-GCM",
  iterV1: 600000,
  iterMin: 150000, iterMax: 2000000, iterDefault: 600000,
  kdfTargetMs: 700,
  saltBytes: 16, ivBytes: 12,
  maxImageBytes: 12 * 1024 * 1024,
  maxFileBytes: 64 * 1024 * 1024,
  histMax: 24, histBudgetBytes: 4 * 1024 * 1024,
  attMax: 12, attMaxBytes: 24 * 1024 * 1024,
});
const MARK_START = "<!--YD:START-->", MARK_END = "<!--YD:END-->";
const enc = new TextEncoder(), dec = new TextDecoder();
const NO_CSP = null;

/* ---------------------------------------------------------------- i18n */
const I18N = {
  en: {
    "tag.encrypted":"Encrypted document","tag.new":"New document",
    "lock.title":"This document is locked",
    "lock.lede":"The contents are encrypted with AES-256-GCM. Enter the password to decrypt it — entirely on this device, with no network access at all.",
    "lock.ph":"Enter the document password","lock.go":"Unlock document",
    "lock.more":"What am I opening?","lock.foot":"There is no password recovery. If the password is lost, the document cannot be read by anyone, including you.",
    "lock.bad":"Wrong password, or the file was modified. Check the password and that the file is intact.",
    "lock.corrupt":"This file's encrypted data is damaged and cannot be decrypted.",
    "lock.future":"This document was written by a newer version of YaleDoc.",
    "lock.old":"This document was written by an older version of YaleDoc.",
    "lock.badkdf":"This document uses a key-derivation method this browser cannot perform.",
    "f.password":"Password","f.repeat":"Repeat password","f.doctitle":"Document title",
    "setup.title":"Protect your document",
    "setup.lede":"Pick a password. It encrypts everything you type, and you can change it later inside the document.",
    "setup.ph":"Choose a strong password","setup.ph2":"Type it again",
    "setup.go":"Create encrypted document",
    "setup.foot":"If you forget this password the document is permanently unreadable.",
    "setup.learn":"How strong is this?",
    "pw.hint0":"At least 10 characters, mixing letters, numbers or symbols.",
    "pw.hint1":"Weak — add length, numbers and symbols.",
    "pw.hint2":"Fair — longer is much stronger.",
    "pw.hint3":"Good.",
    "pw.hint4":"Strong password.",
    "pw.weakBlock":"That password is too weak. Use at least 10 characters with letters and numbers.",
    "pw.match":"The two passwords do not match.",
    "pw.empty":"Choose a password first.",
    "fatal.tag":"Something went wrong","fatal.title":"This document could not be opened",
    "fatal.copy":"Copy the error for a bug report","fatal.reload":"Reload this file",
    "btn.lock":"Lock","btn.new":"New","btn.open":"Open","btn.save":"Save","btn.commands":"Commands",
    "btn.changepw":"Change password",
    "rail.outline":"Outline","rail.history":"History","rail.files":"Files","rail.settings":"Look",
    "rail.snapshot":"Snapshot","rail.attach":"Attach",
    "hist.lede":"Encrypted snapshots saved inside this file. Restoring one is instant.",
    "hist.empty":"No snapshots yet. One is taken automatically every time you save.",
    "hist.restore":"Restore","hist.del":"Delete","hist.now":"Current",
    "files.lede":"Files stored encrypted inside the document. Nothing leaves this device.",
    "files.empty":"No attachments yet.",
    "files.budget":"Size budget","files.get":"Save","files.del":"Remove",
    "set.theme":"Theme","set.font":"Document font","set.size":"Size","set.page":"Page size",
    "set.margin":"Margins","set.lineheight":"Line spacing","set.lang":"Interface language",
    "set.stats":"Document","set.security":"Security","set.autolock":"Auto-lock when idle",
    "st.words":"Words","st.chars":"Characters","st.paras":"Paragraphs","st.read":"Read time",
    "st.pages":"pages",
    "save.clean":"All changes saved","save.dirty":"Unsaved changes","save.saving":"Saving…","save.never":"Not saved yet",
    "drop.img":"Drop an image to embed it","drop.doc":"…or a .ydoc.html file to open it",
    "find.ph":"Find","find.rph":"Replace with","find.none":"No matches","find.one":"1 match","find.n":"matches",
    "toast.saved":"Saved and encrypted","toast.savedDl":"Encrypted file downloaded — replace your copy with it",
    "toast.copied":"Encrypted copy downloaded","toast.locked":"Document locked",
    "toast.img":"Image embedded","toast.imgBig":"That image is too large (max 12 MB)",
    "toast.imgBad":"That file is not an image",
    "toast.attAdded":"Attachment encrypted into the document",
    "toast.attBig":"That file is too large to embed",
    "toast.restored":"Snapshot restored — save to keep it",
    "toast.deleted":"Deleted","toast.copy":"Copied to clipboard",
    "toast.pwChanged":"Password changed and re-encrypted",
    "toast.mdExported":"Markdown exported","toast.txtExported":"Plain text exported",
    "toast.mdImported":"Markdown imported","toast.cleared":"Cleared",
    "toast.openFail":"That is not a YaleDoc file",
    "toast.needDoc":"Open a document first",
    "toast.big":"This document is getting large — attachments and images are what grow it.",
    "err.generic":"Something went wrong. Your text is still here — try the action again.",
    "unsaved.title":"Unsaved changes",
    "unsaved.body":"This document has changes that are not in the file yet. Close anyway?",
    "snap.taken":"Snapshot saved","snap.auto":"Snapshot",
  },
  bn: {
    "tag.encrypted":"এনক্রিপ্টেড নথি","tag.new":"নতুন নথি",
    "lock.title":"এই নথিটি লক করা আছে",
    "lock.lede":"বিষয়বস্তু AES-256-GCM দিয়ে এনক্রিপ্ট করা। পাসওয়ার্ড দিয়ে ডিক্রিপ্ট করুন — সম্পূর্ণভাবে এই ডিভাইসেই, কোনো ইন্টারনেট ছাড়াই।",
    "lock.ph":"নথির পাসওয়ার্ড লিখুন","lock.go":"নথি খুলুন",
    "lock.more":"আমি কী খুলছি?","lock.foot":"পাসওয়ার্ড পুনরুদ্ধারের কোনো উপায় নেই। পাসওয়ার্ড হারালে নথি কেউ পড়তে পারবে না — আপনিও না।",
    "lock.bad":"পাসওয়ার্ড ভুল, অথবা ফাইলটি পরিবর্তিত হয়েছে। পাসওয়ার্ড ও ফাইলের অবস্থা দেখে নিন।",
    "lock.corrupt":"এই ফাইলের এনক্রিপ্টেড ডেটা ক্ষতিগ্রস্ত, ডিক্রিপ্ট করা যাচ্ছে না।",
    "lock.future":"এই নথিটি YaleDoc-এর আরও নতুন সংস্করণে লেখা।",
    "lock.old":"এই নথিটি YaleDoc-এর পুরোনো সংস্করণে লেখা।",
    "lock.badkdf":"এই নথির key-derivation পদ্ধতি এই ব্রাউজার পারে না।",
    "f.password":"পাসওয়ার্ড","f.repeat":"পাসওয়ার্ড আবার লিখুন","f.doctitle":"নথির শিরোনাম",
    "setup.title":"নথি সুরক্ষিত করুন",
    "setup.lede":"একটি পাসওয়ার্ড বেছে নিন। আপনার লেখা সবকিছু এতে এনক্রিপ্ট হবে, পরে নথির ভেতর থেকেই পরিবর্তন করা যাবে।",
    "setup.ph":"একটি শক্তিশালী পাসওয়ার্ড বেছে নিন","setup.ph2":"আরেকবার লিখুন",
    "setup.go":"এনক্রিপ্টেড নথি তৈরি করুন",
    "setup.foot":"পাসওয়ার্ড ভুলে গেলে নথি স্থায়ীভাবে অপাঠ্য হয়ে থাকবে।",
    "setup.learn":"এটি কতটা শক্তিশালী?",
    "pw.hint0":"কমপক্ষে ১০ অক্ষর, অক্ষর-সংখ্যা-চিহ্ন মিলিয়ে।",
    "pw.hint1":"দুর্বল — দৈর্ঘ্য, সংখ্যা ও চিহ্ন যোগ করুন।",
    "pw.hint2":"মোটামুটি — আরও লম্বা হলে অনেক শক্তিশালী।",
    "pw.hint3":"ভালো।",
    "pw.hint4":"শক্তিশালী পাসওয়ার্ড।",
    "pw.weakBlock":"পাসওয়ার্ডটি খুব দুর্বল। কমপক্ষে ১০ অক্ষর, অক্ষর ও সংখ্যাসহ।",
    "pw.match":"দুটি পাসওয়ার্ড মেলেনি।",
    "pw.empty":"প্রথমে একটি পাসওয়ার্ড বেছে নিন।",
    "fatal.tag":"কিছু একটা সমস্যা হয়েছে","fatal.title":"এই নথিটি খোলা যায়নি",
    "fatal.copy":"বাগ রিপোর্টের জন্য ত্রুটি কপি করুন","fatal.reload":"ফাইলটি আবার লোড করুন",
    "btn.lock":"লক","btn.new":"নতুন","btn.open":"খুলুন","btn.save":"সংরক্ষণ","btn.commands":"কমান্ড",
    "btn.changepw":"পাসওয়ার্ড বদলান",
    "rail.outline":"সূচি","rail.history":"ইতিহাস","rail.files":"ফাইল","rail.settings":"চেহারা",
    "rail.snapshot":"স্ন্যাপশট","rail.attach":"সংযুক্ত",
    "hist.lede":"এই ফাইলের ভেতরেই এনক্রিপ্ট করে রাখা স্ন্যাপশট। পুনরুদ্ধার তাৎক্ষণিক।",
    "hist.empty":"এখনো কোনো স্ন্যাপশট নেই। প্রতিবার সংরক্ষণে একটি নিজে থেকেই তৈরি হয়।",
    "hist.restore":"পুনরুদ্ধার","hist.del":"মুছুন","hist.now":"বর্তমান",
    "files.lede":"নথির ভেতরেই এনক্রিপ্ট করে রাখা ফাইল। কিছুই এই ডিভাইস ছাড়ে না।",
    "files.empty":"এখনো কোনো সংযুক্ত ফাইল নেই।",
    "files.budget":"আকারের সীমা","files.get":"সংরক্ষণ","files.del":"সরান",
    "set.theme":"থিম","set.font":"নথির ফন্ট","set.size":"আকার","set.page":"পাতার আকার",
    "set.margin":"মার্জিন","set.lineheight":"লাইনের ব্যবধান","set.lang":"ইন্টারফেসের ভাষা",
    "set.stats":"নথি","set.security":"নিরাপত্তা","set.autolock":"নিষ্ক্রিয় থাকলে লক",
    "st.words":"শব্দ","st.chars":"অক্ষর","st.paras":"অনুচ্ছেদ","st.read":"পড়ার সময়",
    "st.pages":"পৃষ্ঠা",
    "save.clean":"সব পরিবর্তন সংরক্ষিত","save.dirty":"সংরক্ষিত নয়","save.saving":"সংরক্ষণ হচ্ছে…","save.never":"এখনো সংরক্ষিত হয়নি",
    "drop.img":"ছবি যোগ করতে ছেড়ে দিন","drop.doc":"…অথবা খুলতে একটি .ydoc.html ফাইল",
    "find.ph":"খুঁজুন","find.rph":"এর সাথে বদলান","find.none":"কিছু মেলেনি","find.one":"১টি মিল","find.n":"টি মিল",
    "toast.saved":"সংরক্ষণ ও এনক্রিপ্ট হয়েছে","toast.savedDl":"এনক্রিপ্টেড ফাইল ডাউনলোড হয়েছে — আপনার ফাইলটি এটি দিয়ে বদলে নিন",
    "toast.copied":"এনক্রিপ্টেড কপি ডাউনলোড হয়েছে","toast.locked":"নথি লক হয়েছে",
    "toast.img":"ছবি যুক্ত হয়েছে","toast.imgBig":"ছবিটি অনেক বড় (সর্বোচ্চ ১২ MB)",
    "toast.imgBad":"ফাইলটি ছবি নয়",
    "toast.attAdded":"সংযুক্তি এনক্রিপ্ট করে যুক্ত হয়েছে",
    "toast.attBig":"ফাইলটি যুক্ত করার জন্য অনেক বড়",
    "toast.restored":"স্ন্যাপশট পুনরুদ্ধার হয়েছে — সংরক্ষণ করলেই থাকবে",
    "toast.deleted":"মুছে ফেলা হয়েছে","toast.copy":"ক্লিপবোর্ডে কপি হয়েছে",
    "toast.pwChanged":"পাসওয়ার্ড বদলে নথি আবার এনক্রিপ্ট হয়েছে",
    "toast.mdExported":"Markdown রপ্তানি হয়েছে","toast.txtExported":"সাধারণ লেখা রপ্তানি হয়েছে",
    "toast.mdImported":"Markdown আমদানি হয়েছে","toast.cleared":"খালি করা হয়েছে",
    "toast.openFail":"এটি YaleDoc ফাইল নয়",
    "toast.needDoc":"প্রথমে একটি নথি খুলুন",
    "toast.big":"এই নথি বড় হচ্ছে — ছবি ও সংযুক্তিই আকার বাড়ায়।",
    "err.generic":"কিছু একটা সমস্যা হয়েছে। আপনার লেখা এখানেই আছে — কাজটি আবার করুন।",
    "unsaved.title":"সংরক্ষিত নয়",
    "unsaved.body":"এই নথিতে এমন পরিবর্তন আছে যা ফাইলে যায়নি। তবু বন্ধ করবেন?",
    "snap.taken":"স্ন্যাপশট সংরক্ষিত","snap.auto":"স্ন্যাপশট",
  },
};
const LANG_NAME = { en:"English", bn:"বাংলা" };
let LANG = "en";
function t(key, fallback) {
  const tbl = I18N[LANG] || I18N.en;
  return tbl[key] !== undefined ? tbl[key] : (I18N.en[key] !== undefined ? I18N.en[key] : (fallback !== undefined ? fallback : key));
}

/* ---------------------------------------------------------------- utils */
/* accepts either "id" or "#id" so a selector can never silently resolve to null */
const $ = (sel) => (typeof sel === "string" ? document.getElementById(sel.charCodeAt(0) === 35 ? sel.slice(1) : sel) : null);
function mk(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(c => { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return n;
}
function icon(id, cls) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("class", "ico" + (cls ? " " + cls : ""));
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "#i-" + id);
  s.appendChild(u);
  return s;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const nf = new Intl.NumberFormat(LANG === "bn" ? "bn-BD" : "en-US");
function num(n) { try { return nf.format(Math.round(n)); } catch (e) { return String(Math.round(n)); } }
function bytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  return (n / 1073741824).toFixed(2) + " GB";
}
function when(ts) {
  const d = new Date(ts), now = Date.now(), diff = now - ts;
  if (diff < 45000) return LANG === "bn" ? "এইমাত্র" : "just now";
  if (diff < 3600000) return Math.round(diff / 60000) + (LANG === "bn" ? " মিনিট আগে" : "m ago");
  if (diff < 86400000) return Math.round(diff / 3600000) + (LANG === "bn" ? " ঘণ্টা আগে" : "h ago");
  if (diff < 604800000) return new Intl.DateTimeFormat(LANG === "bn" ? "bn-BD" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  return new Intl.DateTimeFormat(LANG === "bn" ? "bn-BD" : "en-GB", { year: "numeric", month: "short", day: "numeric" }).format(d);
}
function stamp(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return String(ts); } }
function debounce(fn, ms) { let h; return function () { const a = arguments, s = this; clearTimeout(h); h = setTimeout(() => fn.apply(s, a), ms); }; }
function rafThrottle(fn) { let pending = false, lastArgs = null; return function () { lastArgs = arguments; if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; fn.apply(this, lastArgs); }); }; }
function safeStorage() {
  try { const s = window.localStorage; s.setItem("__t", "1"); s.removeItem("__t"); return s; } catch (e) { return null; }
}
const store = safeStorage();
function sget(k, d) { try { const v = store && store.getItem("yd2:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function sset(k, v) { try { if (store) store.setItem("yd2:" + k, JSON.stringify(v)); } catch (e) { } }
function yn(v) { return LANG === "bn" ? (v ? "হ্যাঁ" : "না") : (v ? "Yes" : "No"); }

/* ---------------------------------------------------------------- crypto */
class DocError extends Error { constructor(code, msgKey) { super(code); this.code = code; this.msgKey = msgKey; } }

const hasWebCrypto = !!(window.crypto && window.crypto.subtle && window.crypto.subtle.importKey);

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64ToUtf8(b64) { return dec.decode(b64ToBuf(b64)); }
function nfc(s) { try { return (s || "").normalize("NFKC"); } catch (e) { return s || ""; } }

async function pbkdf2(password, saltB64, iterations) {
  const base = await crypto.subtle.importKey("raw", enc.encode(nfc(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64ToBuf(saltB64), iterations: iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
/* AAD is rebuilt from the file's OWN header fields — the fix for the v1 bug
   where the iteration count was taken from a compile-time constant. */
function aadOf(blob) {
  if (blob.v === 1) return enc.encode(JSON.stringify({ f: blob.f, v: blob.v, kdf: blob.kdf, i: blob.i, s: blob.s }));
  return enc.encode(JSON.stringify({ f: blob.f, v: blob.v, alg: blob.alg, kdf: blob.kdf, i: blob.i, s: blob.s }));
}
function validateBlob(b) {
  if (!b || typeof b !== "object") throw new DocError("shape", "lock.corrupt");
  if (b.f !== FMT.name) throw new DocError("format", "lock.corrupt");
  if (typeof b.v !== "number" || !isFinite(b.v)) throw new DocError("shape", "lock.corrupt");
  if (b.v > FMT.maxV) throw new DocError("future", "lock.future");
  if (b.v < FMT.minV) throw new DocError("old", "lock.old");
  const wantKdf = b.v === 1 ? FMT.kdfV1 : FMT.kdf;
  if (b.kdf !== wantKdf) throw new DocError("kdf", "lock.badkdf");
  if (b.v >= 2 && b.alg !== FMT.alg) throw new DocError("alg", "lock.badkdf");
  if (typeof b.i !== "number" || !isFinite(b.i) || b.i < 1000 || b.i > 1e8) throw new DocError("iters", "lock.corrupt");
  if (typeof b.s !== "string" || typeof b.n !== "string" || typeof b.c !== "string") throw new DocError("shape", "lock.corrupt");
  let sb; try { sb = b64ToBuf(b.s); } catch (e) { throw new DocError("b64", "lock.corrupt"); }
  if (sb.length !== FMT.saltBytes) throw new DocError("salt", "lock.corrupt");
  if (b64ToBuf(b.n).length !== FMT.ivBytes) throw new DocError("iv", "lock.corrupt");
  return b;
}
/* Guess the password strength of a document's KDF cost for the lock screen. */
async function unlockWith(password, blob) {
  validateBlob(blob);
  if (!password) throw new DocError("auth", "pw.empty");
  let key, plain;
  try {
    key = await pbkdf2(password, blob.s, blob.i);
  } catch (e) {
    /* some engines reject an empty/odd input key outright - treat any KDF failure
       as "this password did not work" rather than leaking a raw engine error */
    throw new DocError("auth", "lock.bad");
  }
  try { plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(blob.n), additionalData: aadOf(blob) }, key, b64ToBuf(blob.c)); }
  catch (e) { throw new DocError("auth", "lock.bad"); }
  let obj;
  try { obj = JSON.parse(dec.decode(plain)); } catch (e) { throw new DocError("json", "lock.corrupt"); }
  if (!obj || typeof obj !== "object") throw new DocError("shape", "lock.corrupt");
  return { key: key, doc: migrate(obj) };
}
async function sealWith(key, blobHeader, docObj) {
  const iv = crypto.getRandomValues(new Uint8Array(FMT.ivBytes));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv, additionalData: aadOf(blobHeader) }, key, enc.encode(JSON.stringify(docObj)));
  return { f: blobHeader.f, v: blobHeader.v, alg: blobHeader.alg, kdf: blobHeader.kdf, i: blobHeader.i, s: blobHeader.s, n: bufToB64(iv), c: bufToB64(ct) };
}
async function calibrateIters(targetMs) {
  const N = 12000;
  const base = await crypto.subtle.importKey("raw", enc.encode("yale-doc-calibration"), "PBKDF2", false, ["deriveKey"]);
  await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(16), iterations: N }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const t0 = performance.now();
  await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(16), iterations: N }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const per = Math.max(0.002, (performance.now() - t0) / N);
  const want = Math.round((targetMs || FMT.kdfTargetMs) / per / 1000) * 1000;
  return clamp(want, FMT.iterMin, FMT.iterMax);
}

/* ---------------------------------------------------------------- document model */
const DEFAULTS = Object.freeze({
  title: "Untitled document", theme: "paper", font: "sans", size: 12, page: "a4",
  margin: "normal", leading: 1.62, lang: "en", autolock: 0, guides: true,
});
function newDoc() {
  const now = new Date().toISOString();
  return {
    v: FMT.v,
    meta: { title: DEFAULTS.title, created: now, updated: now, app: "yale-doc/2" },
    settings: { theme: DEFAULTS.theme, font: DEFAULTS.font, size: DEFAULTS.size, page: DEFAULTS.page, margin: DEFAULTS.margin, leading: DEFAULTS.leading, lang: DEFAULTS.lang, autolock: DEFAULTS.autolock, guides: DEFAULTS.guides },
    content: "",
    attachments: [],
    history: [],
  };
}
/* v1 plaintext -> v2 */
function migrate(obj) {
  const s = obj.settings || {};
  const out = {
    v: FMT.v,
    meta: {
      title: (obj.meta && obj.meta.title) || DEFAULTS.title,
      created: (obj.meta && obj.meta.created) || new Date().toISOString(),
      updated: (obj.meta && obj.meta.updated) || new Date().toISOString(),
      app: "yale-doc/2",
    },
    settings: {
      theme: s.theme === "sepia" ? "sepia" : s.theme === "dark" ? "ink" : s.theme === "light" ? "paper" : DEFAULTS.theme,
      font: s.fontFamily || DEFAULTS.font,
      size: clamp(Number(s.fontSize) || DEFAULTS.size, 9, 32),
      page: s.pageSize === "letter" ? "letter" : "a4",
      margin: s.margin || DEFAULTS.margin,
      leading: DEFAULTS.leading,
      lang: DEFAULTS.lang,
      autolock: clamp(Number(s.autoLock) || 0, 0, 240),
      guides: DEFAULTS.guides,
    },
    content: typeof obj.content === "string" ? obj.content : "",
    attachments: Array.isArray(obj.attachments) ? obj.attachments : [],
    history: Array.isArray(obj.history) ? obj.history : [],
  };
  if (out.settings.font === "system") out.settings.font = "sans";
  return out;
}

/* ---------------------------------------------------------------- sanitizer */
const ALLOWED_TAGS = new Set(("p br strong b em i u s strike del ins mark code pre kbd samp var sub sup small h1 h2 h3 h4 h5 h6 ul ol li blockquote hr a img table thead tbody tfoot tr th td caption colgroup col span div section figure figcaption abbr cite q time dl dt dd bdi bdo wbr details summary").split(" "));
const DROP_TAGS = new Set(("script style iframe object embed link meta form button select textarea base noscript template svg math canvas audio video source track applet frame frameset input xmp plaintext marquee portal slot").split(" "));
const ALLOWED_CLASSES = new Set("yalign-center yalign-right yalign-justify yind-1 yind-2 yind-3 ycolor-a ycolor-b ycolor-c ycolor-d ycolor-e ycolor-f yhl-1 yhl-2 yhl-3 yhl-4 yhl-5 ylang-bn ylang-en".split(" "));
const ATTR_BY_TAG = {
  "*": ["class", "title", "dir", "lang"],
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height", "data-align"],
  td: ["colspan", "rowspan"], th: ["colspan", "rowspan", "scope"],
  col: ["span"], colgroup: ["span"], ol: ["start", "data-todo"],
  li: ["data-done"], details: ["open"], time: ["datetime"], abbr: [],
};
const IMG_DATA = /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon);base64,[A-Za-z0-9+/=\s]+$/i;
function safeHref(u) {
  const t = String(u == null ? "" : u).replace(/[\u0000-\u0020\u007f]/g, "").trim();
  if (!t) return null;
  if (/^https?:\/\/[^\s]/i.test(t)) return t;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(t)) return t;
  if (/^tel:\+?[0-9 ()-]{5,}$/i.test(t)) return t;
  if (/^#[A-Za-z0-9_-]{1,64}$/.test(t)) return t;
  return null;
}
function safeSrc(u) {
  const t = String(u == null ? "" : u).replace(/[\u0000-\u0020\u007f]/g, "").trim();
  return IMG_DATA.test(t) ? t : null;
}
function scrub(node) {
  if (!node || node.nodeType !== 1) return;
  const kids = Array.prototype.slice.call(node.childNodes);
  for (const n of kids) scrub(n);
  const tag = node.tagName.toLowerCase();
  if (DROP_TAGS.has(tag)) { node.remove(); return; }
  if (!ALLOWED_TAGS.has(tag)) {
    /* unwrap: keep the text, discard the element */
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    node.remove();
    return;
  }
  const allowed = new Set((ATTR_BY_TAG["*"] || []).concat(ATTR_BY_TAG[tag] || []));
  for (const a of Array.prototype.slice.call(node.attributes)) {
    const nm = a.name.toLowerCase();
    if (!allowed.has(nm)) { node.removeAttribute(a.name); continue; }
    if (nm === "class") {
      const keep = a.value.split(/\s+/).filter(c => ALLOWED_CLASSES.has(c));
      if (keep.length) node.setAttribute("class", keep.join(" ")); else node.removeAttribute("class");
    } else if (nm === "href") {
      const v = safeHref(a.value);
      if (v) { node.setAttribute("href", v); if (/^https?:/i.test(v)) { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer nofollow"); } }
      else node.removeAttribute("href");
    } else if (nm === "src") {
      const v = safeSrc(a.value);
      if (v) node.setAttribute("src", v); else node.remove();
    } else if (nm === "target") { node.removeAttribute("target"); }
    else if (nm === "colspan" || nm === "rowspan" || nm === "span") { const k = parseInt(a.value, 10); if (!(k >= 1 && k <= 64)) node.removeAttribute(a.name); else node.setAttribute(a.name, String(k)); }
    else if (nm === "data-align") { if (a.value !== "center" && a.value !== "right") node.removeAttribute(a.name); }
    else if (nm === "data-done") { node.setAttribute("data-done", a.value === "1" ? "1" : "0"); }
    else if (nm === "dir") { if (a.value !== "ltr" && a.value !== "rtl" && a.value !== "auto") node.removeAttribute(a.name); }
    else if (nm === "width" || nm === "height") { const k = parseInt(a.value, 10); if (!(k >= 1 && k <= 100000)) node.removeAttribute(a.name); else node.setAttribute(a.name, String(k)); }
    else if (nm === "start") { const k = parseInt(a.value, 10); if (!(k >= 0 && k <= 100000)) node.removeAttribute(a.name); else node.setAttribute(a.name, String(k)); }
    else if (nm === "title") { node.setAttribute("title", a.value.slice(0, 300).replace(/[\x00-\x1f]/g, "")); }
  }
  if (tag === "a" && node.getAttribute("href") && !/^(https?:|mailto:|tel:|#)/i.test(node.getAttribute("href"))) node.removeAttribute("href");
}
const ALWAYS_STRIP = ["style", "id", "nonce", "contenteditable", "tabindex", "formaction", "xlink:href", "srcdoc", "background", "data", "action", "ping", "download", "srcset", "usemap", "ismap", "longdesc", "profile", "http-equiv", "seamless", "allow", "allowfullscreen", "sandbox"];
function sanitizeHTML(html) {
  try {
    const d = new DOMParser().parseFromString("<body>" + String(html || "") + "</body>", "text/html");
    /* scrub the CHILDREN of the wrapper, never the wrapper itself - scrubbing <body>
       would unwrap it and silently return an empty string for every input */
    for (const n of Array.prototype.slice.call(d.body.childNodes)) scrub(n);
    for (const n of d.body.querySelectorAll("*")) {
      for (const a of ALWAYS_STRIP) if (n.hasAttribute(a)) n.removeAttribute(a);
    }
    return d.body.innerHTML;
  } catch (e) { return ""; }
}

/* -------- normalise: convert our own inline styles into semantic classes -------- */
const PALETTE = { a: "#B4522F", b: "#9C7A2E", c: "#2C6750", d: "#2A5C8A", e: "#6B3FA0", f: "#5B636E" };
const HLPAL = { 1: "#FFF1A8", 2: "#CDEBD4", 3: "#D5E4FF", 4: "#FBD9CB", 5: "#EEDCFF" };
function parseColor(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  if (s === "transparent") return null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) { let h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  m = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/.exec(s);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  return null;
}
function nearest(rgb, table) {
  let best = null, bd = Infinity;
  for (const k in table) {
    const c = parseColor(table[k]);
    if (!c) continue;
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return bd <= 12000 ? best : null;
}
function stripYClasses(el) {
  const keep = [];
  for (const c of (el.className || "").split(/\s+/)) if (c && !/^y(align|ind|color|hl)-/.test(c)) keep.push(c);
  if (keep.length) el.setAttribute("class", keep.join(" ")); else el.removeAttribute("class");
}
function normalizeFormatting(root) {
  const scope = root && root.querySelectorAll ? root : $("ydPages");
  if (!scope) return;
  for (const el of scope.querySelectorAll("[style]")) {
    const st = el.style;
    let touched = false;
    const ta = st.textAlign;
    if (ta) {
      const map = { center: "yalign-center", right: "yalign-right", justify: "yalign-justify", "justify-all": "yalign-justify" };
      if (map[ta]) { stripYClasses(el); el.classList.add(map[ta]); touched = true; }
    }
    const ml = st.marginLeft;
    if (ml) {
      const k = parseFloat(ml);
      if (k >= 1.5) { const lvl = clamp(Math.round(k / 2.2), 1, 3); stripYClasses(el); el.classList.add("yind-" + lvl); touched = true; }
    }
    const c = parseColor(st.color);
    if (c && el !== scope) {
      const near = nearest(c, PALETTE);
      if (near) { stripYClasses(el); el.classList.add("ycolor-" + near); touched = true; }
    }
    const bgc = parseColor(st.backgroundColor);
    if (bgc && el !== scope) {
      const near = nearest(bgc, HLPAL);
      if (near) { stripYClasses(el); el.classList.add("yhl-" + near); touched = true; }
    }
    if (touched) el.removeAttribute("style");
  }
  for (const el of scope.querySelectorAll("[style]")) el.removeAttribute("style");
}

/* ---------------------------------------------------------------- state */
const state = {
  blob: null,        // the encrypted header currently loaded
  key: null,         // non-extractable CryptoKey while unlocked
  doc: null,         // decrypted document object
  unlocked: false,
  dirty: false,
  fileName: null,
  handle: null,      // FileSystemFileHandle when available
  handleName: null,
  lastActivity: Date.now(),
  unlockAt: 0,
  histTimer: null,
  saving: false,
  autolockAt: 0,
};
const editor = () => $("ydPages");
