# YaleDoc — self-encrypting documents

A Word-like document that lives inside **one HTML file** (`.ydoc.html`) and is
**always** password-encrypted. Open it anywhere — Windows, Linux, Android, any
browser — even fully offline. Requires no account, no cloud, no install.

```
source/        app.html           the single-file application (the template)
scripts/       build.py           release the blank file into dist/
dist/          YaleDoc-Blank.ydoc.html    start with this (opens → set password)
               YaleDoc-Demo.ydoc.html     try-it sample (password: demo1234)
docs/          USER-GUIDE.md, ARCHITECTURE.md
dev-notes/     build log / decisions
```

## Quick start
1. Open `dist/YaleDoc-Blank.ydoc.html` in any browser.
2. Choose a password → **Create document**.
3. Type. Insert images (paste, drag, or toolbar). Customize theme/page/font.
4. **Save** → pick a name. Now the file itself is a self-contained encrypted
   document.
5. Send that one `.ydoc.html` to anyone (or open it on your phone). It will
   always ask for the password before showing a single character.
6. Change the password anytime from the toolbar. Nothing is ever stored in
   plaintext on disk.

> Try the demo: open `dist/YaleDoc-Demo.ydoc.html`, password `demo1234`.

## Security model
- AES-256-GCM, key derived with PBKDF2-SHA256 at 600,000 iterations
  (random 16-byte salt per save).
- The ciphertext lives inside the file between `<!--YD:START-->` / `<!--YD:END-->`
  markers. Unlock/crack attempts, wrong passwords, and tampered ciphertext are
  all rejected (GCM authentication). See `docs/ARCHITECTURE.md`.
- The file's visible HTML has zero network access (CSP `default-src 'none'`),
  sanitizes pasted/inserted content, and never leaves plaintext content in the
  saved DOM.

## Development
```
python3 scripts/build.py     # release a fresh blank .ydoc.html to dist/
```
Live-edit `source/app.html`, reload the browser, re-run
`scripts/verify_e2e.py` for the full lock/open/decrypt regression suite.