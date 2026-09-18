
# lincom

**Link Commander** — a Midnight Commander-style desktop link manager. Store, organize, and launch your frequently used web links from a terminal-inspired dual-pane interface.

<p align="center">
  <img src="app-icons/source.png" width="180" alt="lincom icon">
</p>

## Why lincom?

If you live in the terminal and miss the elegance of Midnight Commander, lincom brings that same keyboard-driven, character-grid experience to managing web bookmarks. No browser tabs, no cloud sync overhead, no JavaScript-heavy UI — just your links, organized in folders, accessible in one keystroke.

## Features

### Dual-Pane Terminal UI
- Two panels rendered as a character grid: links on the left, folders on the right
- Single double-vertical line separator with proper `╥`/`╨` junctions
- Resizable window that automatically snaps to whole character rows/columns
- Window size persists across launches
- Frameless, always-on-top window with custom draggable titlebar

### Link Management
- Create, edit, delete with multi-stage MC-style prompts
- Favorite flag (`Ctrl+F`) pins links to the top of any list
- Three-column table view: Name / URL / MTime
- Sort by Name or MTime (click column headers, cycles asc/desc/off)

### Global Search (`Ctrl+S`)
- Omnibox-style search field in the titlebar
- Live dropdown with up to 10 ranked matches
- Windows Explorer ranking: title prefix → title substring → URL substring → description substring
- `Enter` navigates to folder and focuses the link; second `Enter` opens

### Terminal-Grade Text Input
- Block cursor on the current character
- `←/→/Home/End` move caret; `Shift+arrows` and `Ctrl+A` select
- `Ctrl+C` copies selection, `Ctrl+V` pastes
- `↑/↓` walks per-field history from localStorage

### Clipboard (`Ctrl+C`)
- Single link: copies `[Name]: URL`
- Multi-selection (`Space` + arrows): copies all selected joined by newlines

### Window Controls
- `Ctrl+`/`Ctrl-`: 10-step opacity from 30% to 100%
- `C-S-T`: Solarized Light ↔ Dark themes
- Two-row adaptive hotkey bar across full window width

### Folder Organization
- Zero folder ("Main") always present and first
- Digit keys `0–9` jump to folder at that index
- `Ctrl+Shift+H` reorder mode: `←/→` switch focus, `↑/↓` swap, `Enter` commits

### SQLite Backend
- Data in XDG dir (`~/.local/share/dev.lincom.app/links.db` on Linux)
- Idempotent migrations at startup
- Foreign keys with `ON DELETE CASCADE`, WAL mode

## Hotkey Reference

| Key | Action |
|---|---|
| `C-N` | Add link (3-stage prompt) |
| `C-S-N` | Add folder |
| `C-R` | Edit current |
| `C-F` | Toggle favorite |
| `C-C` | Copy (single / multi) |
| `C-S` | Open search |
| `C+` / `C-` | Opacity ± |
| `C-S-H` | Reorder folders |
| `Enter` | Open / enter folder |
| `Del` | Delete (y/N confirm) |
| `C-S-T` | Switch theme |
| `Esc` | Back / cancel |
| `0–9` | Jump to folder |
| `Space` + arrows | Multi-select |
| `↑/↓ ←/→ Tab` | Navigate |

## Installation

### Linux

**Fedora / RHEL**
```bash
sudo dnf install ./lincom-app-0.14.0-1.x86_64.rpm
```

**Ubuntu / Debian**
```bash
sudo apt install ./lincom_0.14.0_amd64.deb
```

**Portable**
```bash
chmod +x lincom-app_0.14.0_amd64.AppImage
./lincom-app_0.14.0_amd64.AppImage
```

### Windows

Download `.msi` from Releases and run. Windows 10/11 ships with WebView2 pre-installed.

## Building from Source

Prerequisites: Rust 1.77+, Node.js 18+, platform libs (`libwebkit2gtk-4.1-dev` on Debian/Ubuntu; `webkit2gtk3-devel` on Fedora).

```bash
git clone https://github.com/Ivan-Cupermush/lincom.git
cd lincom
npm install
cargo tauri dev     # development
cargo tauri build   # release
```

Installers land in `src-tauri/target/release/bundle/`.

## Data Storage

| Platform | Path |
|---|---|
| Linux | `~/.local/share/dev.lincom.app/links.db` |
| Windows | `%APPDATA%\dev.lincom.app\links.db` |
| macOS | `~/Library/Application Support/dev.lincom.app/links.db` |

Schema: `folders(id, name, is_zero, sort_order)` and `links(id, folder_id FK → folders ON DELETE CASCADE, title, url, description, is_favorite, created_at, updated_at)`.

## Architecture

```
┌──────────────────────────────────────────┐
│ TypeScript + Vite (frontend)             │
│  main.ts · render.ts · styles.css · api  │
└──────────────┬───────────────────────────┘
               │ invoke()
┌──────────────▼───────────────────────────┐
│ Tauri 2 (Rust)                           │
│  lib.rs · db.rs (rusqlite) · models.rs   │
└──────────────────────────────────────────┘
```

The UI is drawn as a **character grid**: every element is a monospace glyph. Layout is width in `ch` and height in `--lh`, giving pixel-perfect box drawing with no anti-aliasing artifacts. The MC aesthetic is not a skin — it's the rendering model.

## License

MIT.

*Inspired by [Midnight Commander](https://midnight-commander.org/) and the [Solarized](https://ethanschoonover.com/solarized/) palette.*

