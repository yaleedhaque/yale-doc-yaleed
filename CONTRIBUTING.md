# Contributing to YaleDoc

Thanks for looking. The bar for this project is unusually simple to state and
unusually hard to keep: **one file, zero dependencies, zero network, and every
claim checked by a test.**

## Ground rules

1. **No dependencies.** Not a framework, not a bundler, not a polyfill, not an
   icon font. If it cannot be written against the platform, it does not go in.
2. **No network.** The document's CSP is `default-src 'none'` and must stay that
   way. A change that would need a remote font, script or stylesheet is not a
   change worth making.
3. **The saved file must be pristine.** A `.ydoc.html` may reveal its format
   version, algorithm, KDF name, iteration count and size — nothing else. Not
   the title, not the theme, not the page geometry, not any leftover state.
   `scripts/build.py` and `scripts/verify.py` both enforce this.
4. **Measure, don't guess.** A screenshot is context, not a spec. Add a check to
   `scripts/design_audit.py` that reads the computed style or the real box.
5. **Ship the regression test.** A bug fix lands with a check that fails before
   it and passes after. This is non-negotiable; several bugs in this repository's
   history were only caught because a test existed to catch them.

## Getting set up

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install playwright
python -m playwright install --with-deps chromium firefox webkit
python3 scripts/build.py
python3 scripts/verify.py --engines chromium
```

`--headed` on `verify.py` shows you the browser while it runs.

## The build

The shipped file is assembled; do not edit `source/app.html`.

```
source/parts/01_head.html     markup head, CSP, all CSS
source/parts/02_body.html     icon sprite, markup, payload <script>
source/parts/03_core.js       constants, i18n, utils, crypto, sanitiser, state
source/parts/04_ui.js         i18n, toasts, dialogs, rail, status, error boundary
source/parts/05_editor.js     commands, shortcuts, slash menu, tables, find
source/parts/06_io.js         serialisation, files, imports, palette, wiring, boot
```

Edit the parts, then:

```bash
python3 scripts/build.py                 # assemble + lint + dist/YaleDoc-Blank.ydoc.html
python3 scripts/make_demo.py             # rebuild the demo document
python3 scripts/verify.py                # all three engines
python3 scripts/design_audit.py          # design + a11y
python3 scripts/check_demo.py            # the shipped demo still opens
```

`assemble.py` bakes a fresh nonce into the CSP `<meta>` and the `<script>` tag
on every build. Never hand-edit either.

## Style

Match the file you are in: `const` for bindings, `let` only when reassigning,
two-space indent, one statement per line, no comments that restate the code.
Prefer a named helper over a clever expression. If a piece of logic is subtle,
the comment should say *why*, in one sentence, not *what*.

## Things that have bitten this project before

Worth knowing before you touch the editor — each of these was a real bug:

- **`Selection.collapsed` does not exist.** The standard property is
  `isCollapsed`. Using `collapsed` yields `undefined`, which is falsy, so every
  guard that depended on it silently returned early and an entire feature
  (markdown shortcuts) was dead without any visible error.
- **Chrome inserts `U+00A0`, not a space,** after a word inside a block. A
  regex written for `"# "` never matches `"#\u00a0"`.
- **For the first character of a block the caret is on the element, not a text
  node.** Keydown-based shortcuts see nothing. `input` is the reliable moment.
- **Deleting the trigger text can delete the whole text node.** Create the target
  block *before* deleting, or the command runs against nothing.
- **Never scrub the parser's wrapper `<body>`.** It is not in the allow-list, so
  it gets unwrapped and the sanitiser silently returns `""` for every input —
  and then your XSS tests pass for the wrong reason.
- **`id` selectors passed to `getElementById` return `null`.** `$()` accepts
  both `"app"` and `"#app"` precisely so this cannot happen again.
- **Icon-based buttons need `aria-label`.** An SVG `<use>` contributes no text.
- **Contrast must be computed with alpha compositing.** Comparing a
  semi-transparent background's own RGB values gives a ratio of 1 and a
  misleading pass or fail.

## Pull requests

Keep them focused. Describe the user-visible change, the tests you added, and
anything you measured that surprised you. If you found a bug, say how you found
it — that is the part reviewers most need.
