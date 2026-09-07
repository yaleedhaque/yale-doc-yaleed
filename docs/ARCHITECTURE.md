# YaleDoc Architecture

A single-file, self-encrypting, self-contained document format — no network,
no runtime beyond the browser, no plaintext on disk.

## File format

A `.ydoc.html` is a complete HTML application whose behaviour is determined by
one JSON payload embedded at the end of the `<body>`:

```html
<script type="application/json" id="ydPayload"><!--YD:START-->{...}<!--YD:END--></script>
```

- `null` payload ⇒ **first-run setup screen** (choose a password → create).
- encrypted payload ⇒ **lock screen** until correct password entered.

`buildFileString()` serializes a fresh clone of the live DOM, clears the editor
page, forces every `.screen` + `#app` back to the `hidden` default state, then
writes the encrypted payload into `#ydPayload`. The result is always a file
that boots to a locked state — saved screens never leak into the document.

## Payload (encrypted)

Top-level (plaintext, inside handy markers):

| field | value |
|---|---|
| `f` | `"yale-doc"` (format name) |
| `v` | `1` |
| `kdf` | `"pbkdf2-sha256"` |
| `i` | iteration count = `600000` |
| `s` | 16-byte random salt (base64) |
| `n` | 12-byte GCM IV (base64) |
| `c` | AES-256-GCM ciphertext (base64) |

Ciphertext plaintext structure:

```json
{ "v": 1,
  "meta":   { "title", "created", "updated" },
  "settings": { "theme", "fontFamily", "fontSize", "pageSize", "margin", "autoLock" },
  "content": "<sanitized html of the editor pages>" }
```

## Crypto

- **KDF:** WebCrypto `PBKDF2`-HMAC-SHA-256, 600 000 iterations, 16-byte random
  salt per save. Password NFKC-normalized before hashing.
- **Cipher:** `AES-GCM` 256-bit, random 12-byte IV per encryption.
- **Authenticated data (AAD):** `JSON{ f, v, kdf, i, s }` — so an attacker
  cannot rewrite the salt/iteration fields and weaken the derivation, and GCM
  will refuse tampered ciphertext (throws `OperationError`).
- Wrong password and tampered ciphertext are therefore identical failures:
  no partial plaintext is ever produced.
- Keys are **never stored** in app state: `state.key` is only an unlocked
  boolean. Each encrypt/decrypt re-derives a fresh key from the password.

## Editor

- `contenteditable` on `#ydPages` + `document.execCommand` for formatting
  (bold/italic/headings/lists/links/alignment/undo/redo), zero dependencies.
- Page simulation: fixed-width columns with `overflow:hidden`; `.yd-pagebreak`
  forces a new column; print CSS renders each `.yd-page` as one A4/Letter sheet.
- **Images** (button / drag-drop / paste): canvas downscale to ≤1600px,
  JPEG q=0.85 with white background fill, ≤25 MB payload cap, encoded as
  `data:` URLs in content. No external files, no network.

## Security

- **CSP:** `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`
  — the document cannot make any network request.
- **Sanitizer** (`sanitizeHTML`) on save and on paste:
  - Drops elements: `script, style, iframe, object, embed, form, link, meta,
    head, title`.
  - Strips attributes: all `on*`, `href`/`src` not
    `https:`/`http:`/`data:`/`mailto:` (and no `javascript:`).
- Browser tab title is always `YaleDoc — Encrypted Document` (never the
  document title).
- Opening a foreign HTML file is not needed to read a `.ydoc.html` — but if a
  user pastes attacker-controlled HTML, the sanitizer runs before it enters
  the document or is re-encrypted.

## Auto-lock

- Settings `autoLock: 0 | 1 | 5 | 10 | 30` (minutes). A typing/click
  heartbeat resets a timer; on expiry the editor re-locks to the password
  screen with the document still in memory (no re-derivation needed until the
  next unlock).

## Persistence / Ops

- No localStorage by design: the document *is* the file. "Settings" live in
  the encrypted payload, so theme/page/font travel with the file.
- `newDoc()` clears `#ydPages` and makes a fresh `meta`/`settings`; the user
  must **Save** for anything to persist.
- `scripts/build.py` releases `dist/YaleDoc-Blank.ydoc.html` from the source
  template and refuses non-blank payloads (behavioural guarantee).
- `scripts/verify_e2e.py` (Playwright, headed Chrome) is the regression suite:
  setup → encrypt → save → reopen → wrong-pw → unlock → content/settings
  restored → resave-plaintext-hidden → resave-decrypt-equal.

## Test hooks

Exposed as `window.__yd` (used by the E2E suite):
`buildFileString, getPayloadFromSource, makePayload, openPayload, sanitizeHTML,
currentHtml, state, getMarker, markerEnd`.

## Known limits

- Single-user local: no collaborative editing, no mobile "app" (works in the
  mobile browser, but there is no native wrapper).
- `document.execCommand` is deprecated but works in every major engine, and
  this choice keeps the whole product dependency-free.
- Very large images (25 MB cap) stay embedded; files are some KBs to a few MB.