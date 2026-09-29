# YaleDoc — User Guide

Plain language. No jargon unless it earns its place.

## 1. What a YaleDoc file is

One file called something like `notes.ydoc.html`. It is a complete document:
text, formatting, images, tables, attachments and version history.

It is also the program that opens it. There is nothing to install, no account,
no internet connection. Double-click it and it works — on Windows, macOS, Linux,
Android, iOS or a Chromebook, in Chrome, Firefox, Safari or Edge.

And it is **always encrypted**. The readable text exists only in memory while
the document is unlocked. There is no unencrypted mode, and no copy on any
server, because there is no server.

## 2. Make your first document

1. Open `YaleDoc-Blank.ydoc.html` from the [Releases](../../releases) page.
2. It asks for a password and a repeat of it.
3. Press **Create encrypted document**.

Pick a password you will remember. It is the only key. If you lose it, the
document cannot be read by anyone, including you — there is no recovery, and
that is deliberate. The screen tells you this before you start.

**A password that works:** a short sentence you can recall beats a short word
you cannot. Length matters far more than symbols.

## 3. The editor

### The three bars

- **Top** — the document title (click it to rename), and the side panel, find,
  reading mode and lock buttons.
- **Second** — everything you can do to the file or the text.
- **Bottom** — word and character counts, the real page count, and whether you
  have unsaved changes.

### The side panel

Click the panel icon in the top bar, or press <kbd>Ctrl</kbd>+<kbd>\\</kbd>.

| Tab | What is in it |
|---|---|
| **Outline** | Every heading in your document. Click one to jump to it. |
| **History** | Encrypted snapshots. Restore or delete any of them. |
| **Files** | Attachments, plus a size-budget meter. |
| **Look** | Theme, font, size, page size, margins, spacing, language, auto-lock, statistics, password. |

On a phone the panel slides in over the page.

## 4. Writing

### Type like you mean it

| You type | You get |
|---|---|
| `# ` … `###### ` | Heading 1 – 6 |
| `- ` or `* ` | Bulleted list |
| `1. ` | Numbered list |
| `> ` | Quote |
| `[] ` or `[x] ` | To-do item with a checkbox |
| ` ``` ` | Code block |
| `**bold**` | **bold** |
| `*italic*` / `_italic_` | *italic* |
| `~~struck~~` | ~~struck~~ |
| `` `code` `` | `code` |
| `/` | The insert menu — headings, lists, table, image, link, divider, page break |

The `/` menu filters as you type. Use the arrow keys and <kbd>Enter</kbd>, or
just click.

### The toolbar

File actions: new, open, save, save a copy, print/PDF.
Text: undo, redo, bold, italic, underline, strikethrough, superscript, subscript.
Structure: paragraph, H1–H3, quote, code block, bulleted, numbered, to-do, table.
Layout: align left/centre/right/justify, indent, outdent.
Insert: link, image, text colour, highlight, horizontal rule, page break.
Clean up: clear formatting.

### Tables

Press **Table** and drag over a grid. When your cursor is inside a table a small
floating bar appears with: add row, add column, delete last row, delete last
column, toggle header row, delete table. <kbd>Tab</kbd> moves to the next cell.

### To-do lists

Type `[] ` on a new line. Tick the boxes. The state is stored in the document, so
it survives closing and reopening it.

### Images

Three ways: the image button, drag a file onto the page, or copy an image and
paste. It is resized and re-encoded in your browser and stored inside the
encrypted document — never uploaded. Click an image for alignment, a caption, or
deletion.

## 5. Saving

**Save** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) encrypts and writes.

- In Chrome and Edge the file is written back in place, so <kbd>Ctrl</kbd>+<kbd>S</kbd>
  keeps overwriting the same file. The handle is remembered, so next time you
  open YaleDoc it offers to reopen your last document.
- In other browsers, or the first time, a download happens. YaleDoc says so
  plainly: replace your copy with the downloaded file, or you will keep editing
  the old one.

The bottom bar shows **Unsaved changes** while you have edits that are not yet
in the file, and closing the tab warns you first.

**Save a copy** makes a second encrypted file under a new name — handy for
backups before a big change.

## 6. Opening someone else's document

Double-click the file, or open it in a browser. It asks for the password.
Wrong password ⇒ a clear message and nothing else. Right password ⇒ the
document, with its theme, fonts and page size.

The **What am I opening?** panel tells you the format version, the cipher, the
key-derivation cost, and the file size — useful if someone sends you a file
built by a different version.

## 7. Find, replace, and undo across sessions

- <kbd>Ctrl</kbd>+<kbd>F</kbd> find · <kbd>Ctrl</kbd>+<kbd>H</kbd> find and replace
- <kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd> to move between matches
- <kbd>Ctrl</kbd>+<kbd>Enter</kbd> replace this · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Enter</kbd> replace all

**Version history** is the bigger deal. Every save stores the *previous* version
as an encrypted snapshot inside the file (up to 24, within a size budget). Go
to the side panel → **History** and restore one. Your work survives closing the
tab, reopening, and even sending the file to yourself.

## 8. Attachments

Side panel → **Files** → **Attach**. Any file. It is encrypted into the
document; the **Save** button writes it out again. Nothing leaves the device.

Total document size is shown with a budget meter. Removing large images or
attachments is the fastest way to shrink a file.

## 9. Getting text out

- **Markdown** — headings, bold, italic, code, lists, tables, quotes. Round-trips.
- **Plain text** — no markup.
- **Import Markdown** — paste it in, or choose a `.md` file.
- **Print / PDF** — use your browser's print dialog and choose *Save as PDF*.
  Page breaks and typography are set up for it.

## 10. Keyboard shortcuts

<kbd>Ctrl</kbd>+<kbd>K</kbd> opens the command palette — type any part of a
command's name. <kbd>?</kbd> shows the full list in the app.

| | |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Encrypt and save |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>H</kbd> | Find / find and replace |
| <kbd>Ctrl</kbd>+<kbd>B</kbd> <kbd>I</kbd> <kbd>U</kbd> | Bold / italic / underline |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | Heading 1 / 2 / 3 |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Page break |
| <kbd>Ctrl</kbd>+<kbd>L</kbd> | Lock now |
| <kbd>Ctrl</kbd>+<kbd>\\</kbd> | Side panel |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | Focus mode |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> | Reading mode |
| <kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | Zoom |

## 11. Sharing safely

1. Save, so the file on disk is current.
2. Send the file by whatever channel you like.
3. Send the password by a **different** channel. Never both in one message.
4. Remember that the file is as big as its images and attachments. Compress
   before sending if that matters.

To change the password later: side panel → **Look** → **Change password**. You
type the current one, and YaleDoc verifies it by actually decrypting the file —
then re-encrypts with the new one and saves. The KDF cost is re-measured for
your device at that moment.

## 12. Troubleshooting

| Problem | What to do |
|---|---|
| "Wrong password" and you are sure | Check Caps Lock and your keyboard layout. Passwords are case-sensitive. |
| Forgot the password | Unrecoverable by design. Try an older version from **History** — if you have one. |
| The file opens but is empty | You have not unlocked it yet; the editor only appears after the password is accepted. |
| My download became `document (3).ydoc.html` | Your browser did not grant in-place saving. Use the newest file and delete the old one. |
| The file is very large | Remove images or attachments from the **Files** tab, or delete history entries. |
| A pasted link did not become a link | Only `https:`, `mailto:`, `tel:` and `#anchors` are allowed — by design. |
| "This browser cannot encrypt" | The page is not in a secure context. Open the file directly from disk, not from inside a sandboxed frame. |
| Something looks broken | Press <kbd>?</kbd> for shortcuts, and try a backup from **History**. Please report it. |

## 13. Try it now

`YaleDoc-Demo.ydoc.html` is a real encrypted document with a tour of all of
this. Password: **`YaleDoc-Demo-2026`**
