# Security

YaleDoc is an encryption product, so this document is specific rather than
reassuring. It states the threat model, what is enforced, what is measured, and
what is **not** claimed.

## Threat model

YaleDoc protects a document **at rest, on a device you do not fully trust**.

In scope:

| Adversary | Capability | Outcome |
|---|---|---|
| Someone who obtains the file | Reads the entire file | Sees only ciphertext, the non-sensitive header, and the app |
| An attacker who edits the file | Can change any byte | Tamper is detected by GCM authentication; a downgraded KDF cost is detected by the AAD |
| Malicious content pasted into the document | Full HTML/JS injection attempt | Neutralised by the allow-list sanitiser **and** the nonce CSP |
| Someone shoulder-surfing or walking away | Visual / physical access | Auto-lock, lock button, blur-on-background is out of scope — use a full screen lock |
| A malicious extension or a compromised OS | Full control of the device | **Out of scope.** Nothing running on your device can be protected by a web page |

Explicitly **out of scope**: a hostile operating system, a malicious browser
extension, a keylogger, a hostile swap file, screen recording, and any adversary
who already has your unlocked session.

There is no recovery, no escrow, and no backdoor — by design. A lost password
means a lost document.

## Cryptography

```
plaintext  ──PBKDF2-HMAC-SHA-256──▶  AES-256 key  ──AES-256-GCM──▶  ciphertext
              (password, 16-byte salt,             (12-byte random IV,
               calibrated iteration count)          f/v/alg/kdf/i/s as AAD)
```

**Key derivation.** PBKDF2-HMAC-SHA-256 via WebCrypto — the only KDF available
in every browser engine. The iteration count is **calibrated on the device at
document-creation time** (target ≈ 700 ms, clamped to 150 000 – 2 000 000) and
written into the file, so a fast laptop is not protected by a fast phone's
weakness, and neither is under-protected. Passwords are NFKC-normalised before
hashing so that visually identical input derives the same key.

**Salt.** 16 CSPRNG bytes per document. Rotated whenever the password changes.

**IV.** 12 CSPRNG bytes, **fresh on every save**. This is the parameter AES-GCM
actually requires to be unique per key. (v1 re-derived the key from a new salt
on every save; v2 keeps the derived key in memory and re-randomises the IV
instead, which makes saving ~30× faster while satisfying the same requirement.)

**Authenticated data.** `{"f","v","alg","kdf","i","s"}` is serialised from the
file's *own* header fields and passed as GCM AAD. Consequences, each covered by
a test:

- Flipping any byte of the ciphertext → GCM tag mismatch → rejected
- Replacing the salt → AAD mismatch → rejected
- Lowering the iteration count → AAD mismatch → rejected
- So a wrong password and a tampered file are cryptographically identical, and
  neither produces a single byte of plaintext

> **A bug this fixed.** v1 rebuilt the AAD from a compile-time constant rather
> than from the file, so the format was not forward-portable and a header could
> be altered in ways the KDF did not expect. See `docs/ARCHITECTURE.md`.

**Key lifetime.** The password string is never stored. On unlock a
**non-extractable** `CryptoKey` is held in memory; saves reuse it; `Lock`,
auto-lock, page hide and teardown drop it. Changing the password verifies the
*current* password by actually decrypting the stored payload rather than by
string comparison, then derives a new key and a new salt.

## Content sanitisation

The sanitiser is an **allow-list**, applied on paste, on open, and on save:

- **Allowed tags** — a fixed set of structural and inline elements.
  Everything else is unwrapped (text kept) or, for dangerous elements, removed
  with its subtree.
- **Removed outright** — `script style iframe object embed link meta form input
  button select textarea base noscript template svg math canvas audio video
  source track applet frame frameset xmp plaintext marquee portal slot`.
- **Attributes** — per-tag allow-list. Global: `class title dir lang`.
  `class` tokens must be from a fixed set (`yalign-*`, `yind-*`, `ycolor-*`,
  `yhl-*`…). `id` is never preserved, which removes DOM-clobbering.
- **`style` is always removed.** The editor's own formatting is expressed as
  semantic classes, so there is no reason to allow inline CSS — and that is what
  kills full-viewport UI-spoofing overlays.
- **URLs** — `href` accepts only `https:`, `mailto:`, `tel:` and `#anchor`.
  `img src` accepts only base64 `data:image/*`. `javascript:` is rejected
  *after* HTML entity decoding, so `&#106;avascript:` is caught too. External
  `rel="noopener noreferrer nofollow"` is forced on every link.

19 injection vectors are asserted in `scripts/verify.py`; all are neutralised.

## Content-Security-Policy

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'nonce-<random 128-bit hex, baked at build time>';
  style-src 'unsafe-inline';
  img-src data: blob:;
  font-src data:;
  worker-src 'none';
  connect-src 'none';
  base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none';
  manifest-src 'none'">
```

`default-src 'none'` with `connect-src 'none'` means the page has no way to make
a network request, whatever the content says.

### Why a nonce and not a hash

Inline script hashes (`script-src 'sha256-…'`) were measured and **rejected by
all three engines** — Blink, Gecko and WebKit — even with a byte-exact hash
delivered by a real HTTP header, and six different text encodings were tried. A
nonce-based policy was then verified to work identically on `http://` and
`file://` in all three. The full experiment is in
`~/.config/opencode/shared/research/csp-single-file-notes.md`.

Note that the `<script type="application/json">` data block carrying the
ciphertext is **not** subject to `script-src` in any engine — it is a data block,
not a script. That is what makes a strict nonce policy possible at all.

### Honest limitation

For a file that is redistributed publicly, the nonce value is *public*. A nonce
therefore does not by itself stop an attacker who can inject markup and knows
the value. It removes the "any surviving `<script>` runs" class of bug and
defence-in-depth against sanitiser regressions. **The primary control is the
allow-list sanitiser; the nonce is the second layer, not the first.**

## File hygiene

`buildFileString()` produces every saved file from a **clone** of the live DOM
and then resets it to a pristine, locked state. It is verified that a saved file
contains none of:

- the document title
- the author's theme, language, or page geometry (`--page-w`, `--page-marg`)
- the editor's text, word counts, or any field still holding a password
- any open dialog, toast, find-bar query or progress indicator

A saved file therefore reveals only: the format version, the algorithm name, the
KDF name, the iteration count, and the file size. All of these are visible in
the lock screen's "What am I opening?" panel, deliberately.

## What is verified, and how

`scripts/verify.py` runs 123 checks on each of Chromium, Firefox and WebKit, and
asserts facts read back out of the engine — not properties of the source.

`scripts/design_audit.py` reads computed styles and real bounding boxes across
four viewports, four device pixel ratios and all three themes, including WCAG
contrast ratios computed with proper alpha compositing.

Every claim in the README that is checkable is covered by one of these.

## What is *not* claimed

- **No protection from a compromised device.** JavaScript cannot defend against
  anything with the same privileges as the page.
- **No protection from a malicious extension.**
- **No forward secrecy.** The password-derived key decrypts the file; if the
  password is known, all past and future versions are readable.
- **No protection against traffic analysis** — there is no traffic, but the file
  size and save timing can hint at how much you are editing.
- **PBKDF2 is not memory-hard.** Argon2id would resist GPU cracking better, but
  it is not available in any browser engine's WebCrypto. PBKDF2 at a calibrated
  300k–800k iterations is the strongest primitive actually available here; this
  is a real limit, not an oversight.
- **The salt and iteration count are not secret**, and are not meant to be.

## Reporting a vulnerability

Please open a GitHub issue, or use GitHub's private vulnerability reporting if
it is enabled for this repository. A fix will ship with a regression test that
fails before it and passes after.
