<p align="center">
  <img src="src-tauri/icons/icon.png" width="80" alt="Prompt Library" />
</p>

<h1 align="center">Prompt Library</h1>

<p align="center">
  A lightweight desktop app for organizing, searching, and copying AI prompts.<br/>
  Built with <a href="https://v2.tauri.app">Tauri v2</a>, Rust, and vanilla JavaScript.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

---

## Features

**Organization**
- Folders with custom colors, drag-and-drop reordering
- Tag prompts, star your favorites
- Move prompts between folders by dragging cards to the sidebar

**Productivity**
- One-click copy to clipboard
- Global quick-save shortcut (`Ctrl+Shift+S`)
- Search across names, text, and tags
- Sort by name, date, or last edited
- Keyboard shortcuts: `Ctrl+N` new prompt, `Ctrl+F` search, `Ctrl+B` sidebar

**Extras**
- Attach images to prompts (paste, drag, or browse)
- Character counter with token-limit warnings
- Dark and light theme
- ~5 MB installer

---

## Install

### Download

Head to [Releases](../../releases) and grab the installer for your OS:

| Platform | File |
|----------|------|
| Windows | `Prompt.Library_x.x.x_x64-setup.exe` |
| macOS (Apple Silicon) | `Prompt.Library_x.x.x_aarch64.dmg` |
| macOS (Intel) | `Prompt.Library_x.x.x_x64.dmg` |

Run it, done.

### Build from source

You need [Rust](https://rustup.rs), [Node.js 18+](https://nodejs.org), and `cargo install tauri-cli`.

On macOS, also install Xcode Command Line Tools:
```
xcode-select --install
```

On Windows, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

Then:

```bash
git clone https://github.com/Leonxlnx/prompt-library.git
cd prompt-library
npm install
cargo tauri dev        # run in dev mode
cargo tauri build      # build the installer
```

The installer ends up in `src-tauri/target/release/bundle/`.

---

## Project structure

```
prompt-library/
├── renderer/            # Frontend (HTML, CSS, JS)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── quicksave.html
│   └── quicksave.js
├── src-tauri/           # Rust backend
│   ├── src/lib.rs
│   ├── tauri.conf.json
│   └── Cargo.toml
├── ROADMAP.md
├── LICENSE
└── README.md
```

## Tech stack

| | |
|---|---|
| Framework | [Tauri v2](https://v2.tauri.app) |
| Backend | Rust |
| Frontend | HTML / CSS / JS (no framework) |
| Storage | Local JSON file |
| Font | [Inter](https://fonts.google.com/specimen/Inter) |

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit (`git commit -m 'add your feature'`)
4. Push (`git push origin feature/your-feature`)
5. Open a PR

## License

MIT — see [LICENSE](LICENSE).
