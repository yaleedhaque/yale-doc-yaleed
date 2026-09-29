# YaleDoc Architecture

One file, two jobs: it is the editor *and* the encrypted document. Nothing is
fetched, nothing is installed, nothing is written outside the file you save.

## 1. Build shape

The shipped artefact is assembled from six sources so it stays reviewable:

```
source/parts/01_head.html   doctype, meta, CSP, and the whole stylesheet (design tokens → print)
source/parts/02_body.html   icon sprite (inline SVG), markup, and the payload <script>
source/parts/03_core.js     format constants, i18n, utilities, crypto, sanitiser, state
source/parts/04_ui.js       i18n application, toasts, dialogs, rail, status bar, error boundary
source/parts/05_editor.js   commands, markdown shortcuts, slash menu, tables, find/replace
source/parts/06_io.js       serialisation, files, imports, command palette, wiring, boot
                            ── scripts/assemble.py ──▶ dist/YaleDoc-Blank.ydoc.html
```

`assemble.py` concatenates them, bakes **one** 128-bit nonce into both the CSP
`<meta>` and the executable `<script>`, and asserts the structural invariants
(exactly one payload element, exactly two script elements, the nonce present in
both places, no unsubstituted placeholder). `scripts/build.py` adds 24 further
lint checks and writes `dist/`.

There are **no dependencies** — no framework, no bundler, no polyfill. The only
thing that ever executes is the single inline script.

## 2. File format

```html
<script type="application/json" id="ydPayload"><!--YD:START-->{ … }<!--YD:END--></script>
```

A JSON **data block**, not a script, so `script-src` does not block reading it.
`null` ⇒ first-run setup screen. An object ⇒ lock screen until the password works.

### Header (plaintext, inside the markers)

| field | v1 | v2 | meaning |
|---|---|---|---|
| `f` | ✓ | ✓ | `"yale-doc"` |
| `v` | ✓ | ✓ | format version |
| `alg` | — | ✓ | `"AES-256-GCM"` |
| `kdf` | ✓ | ✓ | `"pbkdf2-sha256"` (v1) / `"PBKDF2-HMAC-SHA256"` (v2) |
| `i` | ✓ | ✓ | PBKDF2 iteration count — calibrated on the author's device |
| `s` | ✓ | ✓ | 16-byte random salt, base64 |
| `n` | ✓ | ✓ | 12-byte random IV, base64 |
| `c` | ✓ | ✓ | AES-256-GCM ciphertext **including the 128-bit tag**, base64 |

### Plaintext (after decryption)

```jsonc
{
  "v": 2,
  "meta":        { "title", "created", "updated", "app" },
  "settings":    { "theme", "font", "size", "page", "margin",
                   "leading", "lang", "autolock", "guides" },
  "content":     "<sanitised semantic HTML>",
  "attachments": [ { "id", "name", "type", "size", "ts", "b64" } ],
  "history":     [ { "ts", "label", "size", "content" } ]   // encrypted snapshots
}
```

`migrate()` upgrades a v1 plaintext to v2 on open — `theme: "dark"` becomes
`"ink"`, `fontFamily: "system"` becomes `"sans"`, and `attachments`/`history`
are added empty. Re-saving writes the current format version; because the key
depends only on `(password, salt, iterations)`, which are identical across
versions, the **same key** re-encrypts the file with no re-derivation.

## 3. Serialising a save

`buildFileString(blob)` clones `document.documentElement` and then:

1. empties `#ydPages` and removes its inline `style`
2. resets the title field, every status/label/error element, the toasts, the
   dialog host, the slash menu, the page guides
3. re-hides every screen, the app shell, the find bar, the busy overlay
4. **resets `<html>` to `data-theme="paper" data-lang="en"` and drops its
   `style` attribute** — so the author's theme, language and page geometry do
   not leak into the pre-unlock DOM *(this was a v1 leak; see below)*
5. writes `MARK_START + JSON.stringify(blob) + MARK_END` into the payload element
6. serialises with a leading `<!DOCTYPE html>`

Step 4 is the important one. A saved file must look *exactly* like a first-run
file apart from its ciphertext.

## 4. Crypto

```js
aadOf(blob) = JSON.stringify(blob.v === 1
  ? { f, v, kdf, i, s }                       // exact v1 byte layout
  : { f, v, alg, kdf, i, s })
```

The AAD is rebuilt from **the file's own header fields**, not from a compile-time
constant. That single change fixes a v1 defect: v1 wrote the iteration count into
the payload but hashed a hard-coded one, so the format was neither forward- nor
backward-portable, and a downgraded `i` was not authenticated.

Key handling:

| moment | state |
|---|---|
| create | `calibrateIters()` measures the device, then `pbkdf2(password, salt, iters)` |
| unlock | derive once; keep a **non-extractable** `CryptoKey` |
| save | re-encrypt with a fresh 96-bit IV — no re-derivation, so saving is ~30× faster than v1 |
| change password | verify by **decrypting** the stored payload with the typed old password, then new salt + new key |
| lock / auto-lock / teardown | drop the key; the password was never stored |

`validateBlob()` distinguishes failures so the UI can be honest: a wrong password
and a tampered file both say so; an unknown KDF, a future version, a bad salt
length and a bad IV length each get their own message rather than a generic one.

## 5. Sanitiser

Allow-list, applied on paste, on open and on save.

- `ALLOWED_TAGS` — structural and inline elements only
- `DROP_TAGS` — everything dangerous, removed with its subtree
- anything else is **unwrapped**, so its text survives but the element does not
- `ATTR_BY_TAG` — per-tag attribute allow-list; `class` filtered to a fixed set
- `style`, `id`, `nonce`, `contenteditable`, `tabindex`, `formaction`,
  `srcdoc`, `xlink:href`, `srcset` … are always stripped
- `safeHref()` accepts only `https:`, `mailto:`, `tel:`, `#anchor` — tested
  *after* entity decoding, so `&#106;avascript:` is caught
- `safeSrc()` accepts only base64 `data:image/*`
- external links are forced to `target="_blank" rel="noopener noreferrer nofollow"`

The sanitiser scrubs the **children** of the parser's wrapper `<body>`, never the
wrapper itself — scrubbing the wrapper would unwrap it and silently return an
empty string for every input. *(That was a live bug found by the suite: the
XSS checks were passing vacuously because the output was `""`.)*

### Why there are no inline styles

`normalizeFormatting()` converts whatever the browser produced
(`style="text-align:center"`, `style="color:#b4522f"`) into semantic classes
(`yalign-center`, `ycolor-a`) by nearest-colour in RGB, then removes the
`style` attribute entirely. So the document is a constrained semantic model,
and the sanitiser can forbid inline CSS completely — which removes CSS-based
UI-spoofing (`position:fixed; width:100vw; height:100vh; z-index:99999`) rather
than trying to filter it.

## 6. Editor

`contenteditable` plus `document.execCommand` for the primitives, because it is
the only editing API present in every engine. The parts that matter:

**Formatting is scoped.** `focusEditorAtEnd()` places the caret at the end only
when the selection is *outside* the editor. v1 selected the entire document when
no selection existed, so clicking **Bold** after clicking the page background
bolded the whole file. This is asserted in the suite.

**Markdown shortcuts fire on `input`, not `keydown`.** For the *first*
character of a block the browser places the caret on the element, so at
keydown time there is no text node to read. By `input` the character is in the
DOM — and it is `U+00A0`, not a space: Chrome inserts a non-breaking space after
a word inside a block, so the trigger text is `"#\u00a0"`. Both facts are
encoded in the rules and in `blockTextOf()`.

**Inline marks select only the captured text.** For `**bold**` the match
includes the delimiters, so the selection is `m[0].indexOf(m[1])` characters in
— otherwise the asterisks get bolded too.

**The trigger is deleted after a block is guaranteed to exist.** Deleting `[] `
can remove the entire text node, leaving the command with nothing to act on, so
a `<p>` is created first.

**To-do lists** are built as `ul[data-todo] > li > (input[type=checkbox] + div)`.
Enter inside one is handled explicitly rather than left to the browser, which
would insert a bare `<li>` and put the next keystroke outside the structure.

**Page guides** are measured, not decorative: `pageMetrics()` walks the block
children, accumulates heights against the usable page height, and forces a new
page at every `.yd-pagebreak`. The real page count in the status bar is that
number. v1 reported `pagebreaks + 1` regardless of content.

## 7. Find & replace

Text nodes are walked once, matches become `Range`s, and they are highlighted
through the **CSS Custom Highlight API** (`CSS.highlights`) where available —
which paints without touching the DOM — with a `<mark data-yfm>` fallback.
Replacement splices ranges in reverse document order so earlier offsets stay
valid. Verified that replace-all leaves no highlight markup behind.

## 8. Files

- **Open** — `FileReader`/`file.text()` + a marker regex. A file that is not a
  YaleDoc document is refused with a message.
- **Save** — `showSaveFilePicker` when available, keeping the handle so `Ctrl+S`
  overwrites in place instead of producing `document (3).ydoc.html`. The handle
  is kept in IndexedDB so the next visit can offer "Reopen your last document".
  Without the API, a normal download, with an explicit note to replace the file.
- **Export** — Markdown, plain text. **Import** — Markdown.
- `localStorage` and `IndexedDB` are wrapped; if a browser forbids them on
  `file://` the app still works, it just loses the convenience.

## 9. Resilience

- A global `error` / `unhandledrejection` boundary turns an unexpected fault
  into a toast with a "details" action, never a blank page
- `handled` `DocError`s are reported in place and not double-reported
- Capability gate: no `crypto.subtle` ⇒ an explicit explanation, not a hang
- `<noscript>` explains what is missing and why nothing is being sent
- Every async path is wrapped; a failed save reports failure and **keeps the
  text in the editor**
- `beforeunload` warns while there are unsaved changes

## 10. Accessibility

Pinch-zoom is enabled (v1 set `user-scalable=no`, a WCAG 1.4.4 violation).
Every icon-only control has an `aria-label`; icons are inline SVG rather than
emoji, so they render identically on every platform. Dialogs are real dialogs:
`role="dialog"`, `aria-modal`, a focus trap, `Escape` to close, focus restored
on close. Formatted text is real elements, so a screen reader gets structure.
Contrast is measured, not eyeballed — the design audit computes WCAG ratios with
proper alpha compositing across all three themes. `prefers-reduced-motion` and
`prefers-contrast` are both honoured, and `color-scheme` is set per theme so
scrollbars and native controls follow.

## 11. Test hooks

`window.__yd` exposes the internals the suites drive (`makeBlobNow`,
`buildFileString`, `unlockWith`, `sanitizeHTML`, `mdToHtml`, `toMarkdown`,
`state`, …). It is a property of the runtime, not of the document: the saved
file's content is produced by `editor().innerHTML`, and the suite asserts that
no hook text ever appears in a saved file.

## 12. Known limits

- `document.execCommand` is deprecated. It is still the only editing primitive
  in all three engines, and using it keeps the whole product dependency-free.
- **PBKDF2 is not memory-hard.** Argon2id is unavailable in WebCrypto; this is
  the strongest primitive the platform actually offers.
- Version history and attachments live inside the file, so they add to its size;
  a budget meter and hard caps (24 MB attachments, 64 MB file) keep it sane.
- Single writer per file. There is no collaborative editing and no merge.
