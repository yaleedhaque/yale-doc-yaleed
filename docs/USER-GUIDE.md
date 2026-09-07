# YaleDoc User Guide

A plain-language guide to making, editing, and sharing your own encrypted documents.

## 1. What is a YaleDoc file?
It is one `.ydoc.html` file — like a Word document, but instead of needing Word
or LibreOffice, it opens in **any browser** (Windows, Linux, Android, iOS,
Chromebook). The special thing: **it is always locked with a password.**
Nothing inside can be read until you type the correct password, and nothing is
ever saved in plaintext.

## 2. Start a new document
1. Open `YaleDoc-Blank.ydoc.html` (double-click it).
2. The screen asks for a **Password** and **Repeat password**.
   - Pick something only you (and the people you'll share with) know.
   - There is no "forgot password" — if you lose it, the document is
     unreadable forever. That is the price of real privacy.
3. Click **Create document**.

## 3. The editor
The toolbar across the top gives you everything a normal document editor has:

| Group | Buttons |
|---|---|
| File | New, Open, Save, Save copy, Print / PDF, Change password |
| Customize | Theme (light / dark / sepia), Font, Size, Page size, Margins, Auto-lock timer |
| Format | Bold, Italic, Underline, Strikethrough |
| Headings | Heading 1, Heading 2, Heading 3, Paragraph, Quote |
| Lists | Bulleted, Numbered |
| Layout | Align left / center / right / justify |
| Tools | Link, Image, Horizontal line, Page break, Undo, Redo, Clear formatting |

- **Insert an image** three ways: use the Image button, drag & drop an image
  onto the page, or copy an image and paste it (Ctrl+V). Images are
  automatically resized and compressed, then stored **inside** the document.
- **Page break** ends the page and starts a new printed page.
- The status bar (bottom) shows word, character, and page counts.

## 4. Saving
- **Save** writes a new `.ydoc.html` file (or updates the one you opened).
  Every save re-encrypts everything with a fresh random "salt", so even two
  saves of the same document look completely different to an attacker.
- **Save copy** writes a second copy under a new name (nice for backups).
- Pick a name ending in `.ydoc.html`, e.g. `my-journal.ydoc.html`.

## 5. Opening a document
1. Open `YaleDoc` or double-click any `.ydoc.html` file.
2. On a locked file the first thing you'll see is **Enter password**.
3. Wrong password → a red "Wrong password" message and nothing else is shown.
4. Correct password → your document appears.

From the editor, **Open** (toolbar) lets you open a different exported file
from disk.

## 6. Changing your password
Toolbar → **Change password** → enter the current password, then the new
password twice. The document is re-encrypted immediately with the new
password.

## 7. Sharing
Just send the `.ydoc.html` file (email, USB, WhatsApp) and tell the recipient
the password. They open it on any device with a browser — **no app install,
no internet needed**. The recipient can even edit and resave.

> Tip: never email the file and the password together in the same message.

## 8. Printing / PDF
Toolbar → **Print / PDF**. The pages are already sized like real paper (A4 or
Letter depending on your Page setting), so the preview looks like a real page.
Choose "Save as PDF" in the printer dialog to make a PDF copy.

## 9. Privacy features
- The document's browser tab shows only a generic title (`YaleDoc — Encrypted
  Document`), not your content's title.
- The document never phones home: no network requests, no analytics, no cloud.
- If you set **Auto-lock**, the editor automatically locks back to the
  password screen after 1, 5, 10, or 30 minutes of no typing (0 = never).
- A password that is typed 3 times and fails shows no file content at all.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| "Wrong password" when you're sure it's right | Check Caps Lock / keyboard layout. Passwords are case-sensitive. |
| Lost your password | Unrecoverable by design. If you saved backups earlier, try them. |
| File opens but page looks empty | Make sure the password was accepted — the app stays locked until it is. |
| Images make the file huge | Images are auto-compressed; very large pasted photos may still grow the file. 25 MB payload cap. |
| "This site can't be reached" / network warning | Ignore — YaleDoc deliberately uses no network. Open the file directly from disk, not a web address. |

## 11. Try it right now
- Open `dist/YaleDoc-Demo.ydoc.html` with password **demo1234** to see a fully
  working encrypted document before making your own.