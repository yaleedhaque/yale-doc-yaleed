# YaleDoc — self-encrypting documents

[![CI](https://github.com/yaleedhaque/yale-doc-yaleed/actions/workflows/ci.yml/badge.svg)](https://github.com/yaleedhaque/yale-doc-yaleed/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-9C7A2E.svg)](LICENSE)
![no dependencies](https://img.shields.io/badge/dependencies-0-2C6750.svg)
![offline](https://img.shields.io/badge/network-0%20requests-B4522F.svg)
![verified](https://img.shields.io/badge/verified-Chromium%20%E2%80%93%20Firefox%20%E2%80%93%20WebKit-2C6750.svg)

**A document that is also the program that reads it.** One `.ydoc.html` file
contains the entire editor *and* your AES-256-GCM-encrypted content. Double-click
it on Windows, macOS, Linux, Android, iOS or a Chromebook — in Chrome, Firefox,
Safari or Edge — and it opens. No install, no account, no network, no server, no
telemetry. Close the internet and it still works.

```
dist/YaleDoc-Blank.ydoc.html      243 KB   start here — opens and asks for a password
dist/YaleDoc-Demo.ydoc.html       251 KB   a real encrypted document (password below)
```

> **Try the demo:** open `dist/YaleDoc-Demo.ydoc.html`, password **`YaleDoc-Demo-2026`**.

---

## Why this exists

Most encrypted-document tools want an account, an app, or a server. All three are
attack surface, and all three mean the document stops working when the vendor
does. YaleDoc has none of them. The file *is* the database, and the browser you
already have is the runtime. There is nothing to attack because there is nothing
to reach — the page's Content-Security-Policy is `default-src 'none'`, so the
document physically cannot make a request.

## What is inside

**Writing**
- Markdown shortcuts as you type: `# `, `## `, `- `, `1. `, `> `, `[] `, ` ``` `
- Inline marks: `**bold**`, `*italic*`, `_italic_`, `~~strike~~`, `` `code` ``
- `/` insert menu with keyboard navigation
- Headings H1–H6, quotes, code blocks, both list kinds, to-do lists with
  real checkboxes, horizontal rules, page breaks, links, images
- Tables with a floating context bar: add/remove rows and columns, toggle the
  header row, delete the table
- Indent/outdent, text colour, highlight, superscript/subscript, clear formatting
- Image embed by button, drag-and-drop or paste — downscaled and re-encoded
  in-browser, then stored inside the encrypted payload

**Finding and recovering**
- Find & replace (`Ctrl+F` / `Ctrl+H`) that highlights through the CSS Custom
  Highlight API where available, with a `<mark>` fallback — it never mutates your text
- **Encrypted version history.** Snapshots live *inside* the file, so undo
  survives closing the tab. Take one manually or let every save add one.
- **Encrypted attachments.** Drop in a PDF or a zip; it is stored and decrypted
  locally, never uploaded
- Markdown and plain-text export, Markdown import

**Reading and looking**
- Three themes — paper, ink, sepia — with real `color-scheme` so scrollbars and
  form controls match
- Four document fonts (sans, serif, mono, বাংলা), 9 sizes, adjustable line spacing
- A4 or US Letter, three margin presets, and **measured page guides** that mark
  where the printed page breaks actually fall
- Focus mode, reading mode, zoom, live outline built from your headings
- Word / character / paragraph counts and reading time
- Full English and বাংলা interface

**Staying safe**
- Auto-lock when idle (1, 5, 10 or 30 minutes)
- Unsaved-changes guard — closing the tab warns you
- Command palette (`Ctrl+K`) and a keyboard-shortcut sheet (`?`)

## The security model

| Layer | Choice | Why |
|---|---|---|
| Cipher | **AES-256-GCM** | Authenticated: any flipped bit is detected, not decrypted |
| Key derivation | **PBKDF2-HMAC-SHA-256**, calibrated per device | In every browser; the iteration count is measured on *your* machine at creation and stored in the file (typically 300k–800k) |
| Salt | 16 random bytes, per document | Rotated whenever the password changes |
| IV | 12 random bytes, **new on every save** | The parameter GCM actually requires to be unique |
| Authenticated data | `{f, v, alg, kdf, i, s}` from the file's own header | An attacker cannot downgrade `i` or swap the salt without breaking authentication |
| Password storage | Never written, never retained | Only a non-extractable `CryptoKey` lives in memory, dropped on lock |
| Sanitiser | **Tag allow-list** | Deny-lists leak; allow-lists do not. `style` is stripped entirely; formatting is expressed as semantic classes |
| CSP | `default-src 'none'`, `script-src 'nonce-…'` | Zero network by construction; a pasted `<script>` cannot execute even if it survived sanitising |
| Rendering | Semantic classes, no inline styles | Removes the whole class of CSS-based UI-spoofing attacks |

Read [`docs/SECURITY.md`](docs/SECURITY.md) for the threat model, what is
verified, and — importantly — what is **not** claimed.

## Try it in thirty seconds

1. Download [`dist/YaleDoc-Blank.ydoc.html`](dist/YaleDoc-Blank.ydoc.html).
2. Open it. It asks for a password. That is the entire setup.
3. Type, or type `# ` to get a heading, or `/` for the insert menu.
4. Press `Ctrl+S`. You now have one encrypted file.
5. Send it to someone. They need only the password and a browser.

If you lose the password, the document is gone. There is no recovery, because
there is no copy of your key anywhere else on Earth. That is the trade.

## Verification

This project is checked by its own tests rather than by assertion. Everything
below runs in CI on every push, on three independent engines.

```
scripts/build.py          assemble the parts, then lint the result
scripts/verify.py         123 behavioural / crypto / security checks per engine
scripts/design_audit.py   63 design + accessibility checks, 4 viewports, 3 themes
scripts/check_demo.py     proves the shipped demo really opens
```

Current status:

| Suite | Chromium | Firefox | WebKit |
|---|---|---|---|
| Behaviour, crypto, security (123 each) | ✅ | ✅ | ✅ |
| Design + a11y (63, incl. DPR 1 / 1.25 / 2 / 3) | ✅ | — | — |

Among the things these suites actually prove, rather than claim:

- Pressing **Bold** with no selection does *not* bold the whole document
  (v1 did — it silently applied the format to every paragraph)
- 19 XSS vectors are neutralised: script tags, event handlers, `javascript:`
  and entity-encoded `javascript:` hrefs, `data:text/html` links, full-viewport
  spoofing overlays, `<iframe>`, SVG/MathML mutation tricks, `<base>`, `srcset`,
  `formaction`, id-clobbering and nonce forgery
- Tampering with **any** of salt, iteration count, IV or ciphertext is rejected
- A **v1 document still opens** in v2, and re-saving upgrades it in place
- The saved file leaks no title, no theme, no language and no page geometry
  before you type the password

Run them yourself:

```bash
pip install playwright && python -m playwright install --with-deps chromium firefox webkit
python3 scripts/build.py
python3 scripts/verify.py --engines chromium,firefox,webkit
python3 scripts/design_audit.py
```

## Repository layout

```
source/parts/          the six files the single-file app is assembled from
scripts/assemble.py    concatenates them, bakes one CSP nonce, asserts structure
scripts/build.py       assemble + 24 structural lint checks -> dist/
scripts/make_demo.py   builds the demo by driving a real browser
scripts/verify.py      the 123-check behavioural suite
scripts/design_audit.py  computed-style design & accessibility audit
docs/                  ARCHITECTURE.md · USER-GUIDE.md · SECURITY.md
dist/                  the two files you actually open
```

`dist/YaleDoc-Blank.ydoc.html` is committed, not generated at download time —
you can verify offline that the file you have is the file in this repository.
`source/app.html` is a build artefact and is git-ignored; edit
`source/parts/*` and run `python3 scripts/build.py`.

## Browser support

Verified end-to-end on Chromium, Firefox and WebKit via Playwright, desktop and
mobile viewports. `file://` is a secure context in all three, so WebCrypto is
available. If a browser ever lacks `crypto.subtle` the app says so explicitly
instead of failing silently.

## Licence

MIT © [Md. Yaleed Haque](https://github.com/yaleedhaque)
