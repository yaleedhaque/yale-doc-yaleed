[2026-09-07 11:00] PROJECT YaleDoc created — self-encrypting single-file documents (.ydoc.html)
[2026-09-07 11:00] PATH: D:\OpenCode Projects\Development\yale-doc\
[2026-09-07 11:00] DECISION: single HTML template powering a "blank" file;
          payload = null -> setup screen; non-null -> lock screen.
[2026-09-07 11:00] CRYPTO: WebCrypto AES-256-GCM, PBKDF2-SHA256 600k iter,
          16B salt/save, 12B IV, AAD binds {f,v,kdf,i,s}. state.key is only a
          boolean "unlocked" flag; keys derived fresh per encrypt/decrypt.
[2026-09-07 11:00] SECURITY: CSP default-src 'none'; sanitizer drops
          script/style/iframe/object/embed/form/link/meta + on* + javascript:.
[2026-09-07 11:04] FIX: defaultsDoc() used $("html") (getElementById null) ->
          TypeError at 411 crashing $.onclick 566. Now documentElement.dataset.
[2026-09-07 11:05] FIX: buildFileString used global indexOf on START/END markers
          -> ambiguous vs JS const/comment literals. Now DOM-queries
          script#ydPayload (clone.querySelector) + getPayloadFromSource uses
          regex on the id'd element only.
[2026-09-07 11:07] FIX: saved file leaked live DOM state (setup screen kept
          .hidden class missing). buildFileString now force-hides every
          .screen + #app in the clone -> saved files always boot locked.
[2026-09-07 11:09] VERIFY: scripts/verify_e2e.py (Playwright headed Chrome) —
          13/13 PASS, 0 pageerrors: setup->encrypt->save->reopen->wrong-pw
          rejected->unlock restores content/title/settings->resave has zero
          plaintext in DOM->decrypt-equal.
[2026-09-07 11:10] BUILD: scripts/build.py -> dist/YaleDoc-Blank.ydoc.html
          (41,775 B). Demo: dist/YaleDoc-Demo.ydoc.html (pw demo1234).
[2026-09-07 11:11] DOCS: README.md, docs/USER-GUIDE.md, docs/ARCHITECTURE.md,
          LICENSE (MIT). Screenshots in D:\OpenCode Projects\Screenshots\.