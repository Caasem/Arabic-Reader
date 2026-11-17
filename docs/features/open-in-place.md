# Open in place: double-click a PDF, many light windows, find every book on the computer

Roadmap id: `open-in-place` · Area: Formats and export · Status: in progress (branch `feat/open-in-place`) · Desktop (Electron) only · Replaces the desktop half of `device-scan`; `watch-folder` stays an idea

Level: none of Adler's four. This is how books reach the reader. The light window suits Level 2 (skimming several books at once), and the scan is the first step of Level 4 (gathering every book on a question).

## 1. Purpose

Opening a PDF should feel like opening it in Preview: double-click it and it is on screen at once, in its own small window, with no import. Several PDFs open side by side in several windows. The app can also find every PDF and EPUB on the computer and list them, so nothing has to be imported to be read.

## 2. Decisions

- **The file stays where it is.** A book opened in place is not copied into the app's storage. The app keeps a record of it (a `BookMeta` marked `inPlace`), keyed by the file's SHA-256, so highlights, notes, words and the reading position stay with it. Renaming or moving the file loses nothing: the hash finds the record again.
- **Add to library** copies the file in, when the reader wants a copy the app keeps. The record and everything on it stay the same.
- **PDFs open as pages only.** No EPUB conversion for a book opened in place (`pdf.reflow: 'skipped'`). Converting stays a library import.
- **The main process owns paths.** The renderer never sees a path it could use to read: it gets an opaque token, or asks by hash. The main process reads only files the OS handed it (double-click, Open with, drag onto the icon), the reader chose in a dialog, or the scan found under the scan's roots.
- **The app is not made the default PDF app.** Windows does not allow it. The installer registers the app for `.pdf` and `.epub`, so it appears in Open with; the reader ticks "Always" once. A short note in Settings → Desktop says so.
- **Windows know about each other.** The main process keeps the list of open windows and the book in each, and sends it to every window when it changes. Nothing uses it beyond a small "Open now" list yet; it is the road to shared documents across PDFs (section 8).

## 3. Expected behaviour

**Opening a file**
- Double-clicking a `.pdf` or `.epub` (or Open with → Arabic Reader, or dropping it on the app's icon) opens it in a **light window**: the reader alone, no library or navigation bar, titled with the book's title.
- If the app is not running, it starts with only that light window. If it is running, the new window opens in the same process, so it appears at once.
- Opening a file that is already open focuses its window instead of opening a second.
- Opening several files at once opens one window each.
- In the main window, **Open file…** (Ctrl+O, and a button in the Library on desktop) picks a file and opens it the same way.
- A file the app cannot open in place (MOBI, AZW3, TXT, Markdown) goes through the ordinary import into the main window, since those need converting.

**The light window**
- Opens at about 960 × 1100 (smaller if the screen is), remembers nothing about the main window's size, and shows only once it is drawn (no white flash).
- The reader is the same one as in the main window: dictionary popup, highlights, notes, Alt+ shortcuts, Focus, ink.
- The reader's Back control becomes **Library**: it opens the main window (or focuses it) and leaves the light window open.
- **Add to library** in the reader's header menu, for a book opened in place. After it, the book is a library book like any other.
- Closing the last window quits the app on Windows and Linux, as now.

**In the Library**
- Books opened in place appear in the Library with a small "On this computer" mark and open in a light window.
- If the file has moved or gone, the card says "File not found" with **Find it…** (a file dialog; the chosen file must have the same hash) and **Remove**.
- On another device (sync) a book opened in place shows as a book without its file, as books synced without a file already do.

**Find books on this computer**
- Library → **Find books on this computer** (desktop only) opens a panel.
- The scan looks in Documents, Downloads, Desktop, and the Telegram Desktop and WhatsApp download folders when they exist, plus any folders the reader adds with **Add a folder…**. It goes 12 folders deep and skips hidden folders, system folders, `AppData`, `node_modules`, `.git` and app bundles.
- It reads only names, sizes and dates; it does not open or hash a file until the reader opens it.
- It finds `.pdf` and `.epub` (open in place) and `.mobi`, `.azw3`, `.txt`, `.md` larger than 1 KB (add to library only). TXT and MD are off in the format filter by default, since most are not books.
- Live count while scanning ("4,210 files checked, 63 books found") and **Stop**. Results appear as they are found.
- Each row: file name, format, folder (shortened), size, date modified, and "In library" when the app already knows that file.
- Filters: format, folder, a text search on the file name, and "Hide books already in my library". Sort by name, folder, size or date. The list is virtualised.
- Clicking a row opens it in a light window. Ticking rows and pressing **Add to library (N)** imports them the ordinary way.
- The results are kept until the next scan. **Scan again** refreshes them.

**Open now**
- The main window's Library shows "Open now" with the books in other windows, when there are any. Clicking one focuses its window.

## 4. Data

- `BookMeta.inPlace?: true` (synced). Set on a book opened in place; cleared by Add to library. No schema change: the field is not indexed.
- For a PDF opened in place, `BookMeta.pdf = { pages, reflow: 'skipped', originalHash }` with no `fileHash`, so `getBookFile` returns undefined and every caller already treats that as "no EPUB here". For an EPUB, `fileHash` is the file's hash, as for a library book.
- The main process keeps, under `userData`:
  - `disk-files.json`: hash → { path, size, mtime } for files it may read. Written when a file is opened or found again.
  - `scan.json`: the last scan's roots, extra folders and results (path, name, format, size, mtime). Paths found by the scan may be read.
  - A hash cache keyed by path + size + mtime, so reopening a large PDF does not hash it again.
- Not synced: paths are this computer's.

## 5. Desktop bridge (`window.arabicReaderDesktop`)

- `files.describe(token)` → { name, size, mtime, hash, ext }. Hashes in the main process (streamed), cached.
- `files.read(token)` → bytes. `files.readByHash(hash)` → bytes or null, from `disk-files.json`.
- `files.open()` → opens the system dialog and the chosen file in a light window.
- `files.locate(hash)` → dialog; accepts only a file with that hash; updates `disk-files.json`.
- `files.has(hash)` → true when the recorded path exists with the recorded size and mtime.
- `windows.openBook(bookId)`, `windows.openLibrary()`, `windows.focus(windowId)`, `windows.list()`, `windows.onChange(cb)`, `windows.setBook(bookId, title)` (each window reports what it shows).
- `scan.start(extraFolders)`, `scan.stop()`, `scan.results()`, `scan.onProgress(cb)`, `scan.addFolder()`, `scan.removeFolder(path)`, `scan.openResult(path)` (→ light window), `scan.readResult(path)` (bytes, for Add to library).

All handlers keep the existing `fromAppWindow` check.

## 6. Technical notes

- `app.requestSingleInstanceLock()`; file paths from `process.argv` on first start, from `second-instance`'s argv afterwards, and from `open-file` on macOS (which can arrive before `ready`).
- electron-builder `fileAssociations` for `pdf` and `epub` (role Viewer). NSIS then registers Open with. No installer build is needed to test: `electron . <file>` passes the path the same way.
- Light window URL: `app://…/#/window/<token>` for a file, `#/window/book/<bookId>` for a book already known. The route renders `ReaderSwitch` alone.
- Preferences are in localStorage: listen for the `storage` event so a change in one window reaches the others.
- Several windows use one IndexedDB; Dexie handles that, and the BlobStore already takes a Web Lock.
- Each window is its own renderer process (roughly 150–250 MB). The light window loads only the reader's chunks.

## 7. Not in this change

- Watching folders for new files (`watch-folder`).
- Scanning on Android, iOS or the web (`device-scan` keeps those platforms).
- Making the app the default PDF app.
- Keeping the app running in the tray after the last window closes.

## 8. Next: shared documents across open books

The windows list is the base for working across several open PDFs at once. Not built; recorded so the windows list is shaped for it:
- A note, highlight or desk item dragged or copied from one window into another, keeping a link to where it came from.
- One study desk or thinking-desk thread open beside several books, taking items from whichever window is in front.
- Muqābala (two books side by side) using two real windows instead of two panes.
