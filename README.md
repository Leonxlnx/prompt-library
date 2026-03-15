<p align="center">
  <img src="src-tauri/icons/icon.png" width="100" alt="Prompt Library Logo" />
</p>

<h1 align="center">Prompt Library</h1>

<p align="center">
  <strong>A fast, beautiful desktop app to organize, search, and instantly copy your AI prompts.</strong>
</p>

<p align="center">
  Built with <a href="https://v2.tauri.app">Tauri v2</a> · Rust backend · Vanilla JS frontend
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/tauri-v2-orange?style=flat-square" alt="Tauri v2" />
</p>

---

## ✨ Features

- **Folder Organization** — Group prompts into folders with custom colors
- **One-Click Copy** — Instantly copy any prompt to your clipboard
- **Quick Save** — Global shortcut (`Ctrl+Shift+S`) to save prompts from anywhere
- **Favorites** — Pin your most-used prompts with a ⭐ star
- **Drag & Drop** — Move prompts between folders, reorder folders by dragging
- **Image Attachments** — Attach reference images to prompts (paste, drag, or browse)
- **Smart Search** — Search across prompt names, text, and tags
- **Sort Options** — Sort by name, date created, or recently edited
- **Tag System** — Tag prompts for quick filtering (max 3 shown per card)
- **Dark / Light Theme** — Toggle with one click
- **Keyboard Shortcuts** — `Ctrl+N` new prompt, `Ctrl+F` search, `Ctrl+B` toggle sidebar
- **Character Counter** — Token-limit awareness with 4K/8K warnings
- **Tiny Footprint** — ~5 MB installer (thanks to Tauri)

## 📸 Screenshots

<!-- Add screenshots here -->
<!-- ![Main View](screenshots/main.png) -->

## 🚀 Installation

### Download Pre-built Installer

Go to the [Releases](../../releases) page and download the installer for your platform:

| Platform | File |
|----------|------|
| **Windows** | `Prompt.Library_x.x.x_x64-setup.exe` |
| **macOS** | `Prompt.Library_x.x.x_aarch64.dmg` or `_x64.dmg` |

Run the installer and you're good to go.

### Build from Source

#### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Rust** | latest stable | [rustup.rs](https://rustup.rs) |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) |
| **Tauri CLI** | 2.x | `cargo install tauri-cli` |

**macOS additional:** Xcode Command Line Tools (`xcode-select --install`)

**Windows additional:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload, and [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 11).

#### Steps

```bash
# Clone the repository
git clone https://github.com/Leonxlnx/prompt-library.git
cd prompt-library

# Install frontend dependencies
npm install

# Run in development mode (hot-reload)
cargo tauri dev

# Build production installer
cargo tauri build
```

The installer will be in `src-tauri/target/release/bundle/`:
- **Windows:** `nsis/Prompt Library_x.x.x_x64-setup.exe`
- **macOS:** `dmg/Prompt Library_x.x.x_aarch64.dmg`

## 🏗️ Project Structure

```
prompt-library/
├── renderer/            # Frontend (HTML, CSS, JS)
│   ├── index.html       # Main window
│   ├── styles.css       # All styles
│   ├── app.js           # Main app logic
│   ├── quicksave.html   # Quick save popup
│   └── quicksave.js     # Quick save logic
├── src-tauri/           # Rust backend
│   ├── src/lib.rs       # Commands, data models, persistence
│   ├── tauri.conf.json  # Tauri configuration
│   └── Cargo.toml       # Rust dependencies
├── ROADMAP.md           # Feature roadmap
└── README.md            # This file
```

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Tauri v2](https://v2.tauri.app) |
| **Backend** | Rust |
| **Frontend** | Vanilla HTML/CSS/JS |
| **Storage** | Local JSON file (`%APPDATA%` / `~/Library/Application Support`) |
| **Font** | [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts) |

## 📋 Roadmap

See [ROADMAP.md](ROADMAP.md) for the full feature roadmap.

**Completed:**
- ✅ Update 1 · Core Polish
- ✅ Update 2 · Productivity
- ✅ Update 3 · Organisation

**Planned:**
- 🎨 Update 4 · Design Overhaul
- ⚡ Update 5 · Power Features (template variables, export/import, history)
- 🤖 Update 8 · AI Integration (prompt optimizer, auto-tagging)
- ☁️ Update 9 · Sync & Cloud

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Leon Lin** — [@Leonxlnx](https://github.com/Leonxlnx)
