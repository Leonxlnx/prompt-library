const { app, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// ─── CRITICAL: Set AppUserModelId BEFORE anything else ─────────
// This makes Windows treat this as a unique app (enables taskbar pinning)
app.setAppUserModelId('com.promptlibrary.app');

// ─── Image Storage Directory ───────────────────────────────────
const imageDir = path.join(app.getPath('userData'), 'images');
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

const store = new Store({
  defaults: {
    folders: [
      {
        id: 'default',
        name: 'General',
        prompts: [
          {
            id: 'welcome',
            name: 'Welcome Prompt',
            text: 'You are a helpful AI assistant. Please answer my questions clearly and concisely.',
            tags: ['general', 'starter'],
            images: [],
            createdAt: new Date().toISOString()
          },
          {
            id: 'code-review',
            name: 'Code Review',
            text: 'Please review the following code for bugs, performance issues, and best practices. Provide specific suggestions for improvement.',
            tags: ['coding', 'review'],
            images: [],
            createdAt: new Date().toISOString()
          }
        ]
      },
      {
        id: 'creative',
        name: 'Creative Writing',
        prompts: [
          {
            id: 'storyteller',
            name: 'Story Generator',
            text: 'Write a compelling short story based on the following premise. Include vivid descriptions, engaging dialogue, and a surprising twist.',
            tags: ['creative', 'writing'],
            images: [],
            createdAt: new Date().toISOString()
          }
        ]
      }
    ],
    theme: 'dark',
    windowBounds: { width: 1100, height: 750 },
    desktopShortcutCreated: false
  }
});

let mainWindow;
let tray;

// ─── Icon Helpers ──────────────────────────────────────────────
function getIconPngPath() {
  return path.join(__dirname, 'build-resources', 'icon.png');
}

function getIconIcoPath() {
  return path.join(__dirname, 'build-resources', 'icon.ico');
}

/**
 * Convert a PNG file to ICO format (Windows icon).
 * ICO is just a simple container wrapping the PNG data.
 */
function convertPngToIco(pngPath, icoPath) {
  try {
    const pngData = fs.readFileSync(pngPath);

    // Read PNG dimensions from IHDR chunk (bytes 16-23)
    let width = pngData.readUInt32BE(16);
    let height = pngData.readUInt32BE(17);

    // ICO uses 0 for 256
    const icoWidth = width >= 256 ? 0 : width;
    const icoHeight = height >= 256 ? 0 : height;

    // ICONDIR header (6 bytes)
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);     // Reserved
    header.writeUInt16LE(1, 2);     // Type: 1 = ICO
    header.writeUInt16LE(1, 4);     // Number of images: 1

    // ICONDIRENTRY (16 bytes)
    const entry = Buffer.alloc(16);
    entry.writeUInt8(icoWidth, 0);   // Width
    entry.writeUInt8(icoHeight, 1);  // Height
    entry.writeUInt8(0, 2);          // Color palette
    entry.writeUInt8(0, 3);          // Reserved
    entry.writeUInt16LE(1, 4);       // Color planes
    entry.writeUInt16LE(32, 6);      // Bits per pixel
    entry.writeUInt32LE(pngData.length, 8);   // Image size
    entry.writeUInt32LE(6 + 16, 12);          // Offset (header + entry)

    // Write ICO file
    const ico = Buffer.concat([header, entry, pngData]);
    fs.writeFileSync(icoPath, ico);
    return true;
  } catch (e) {
    console.error('ICO conversion failed:', e);
    return false;
  }
}

function ensureIcoExists() {
  const icoPath = getIconIcoPath();
  const pngPath = getIconPngPath();
  if (!fs.existsSync(icoPath) && fs.existsSync(pngPath)) {
    convertPngToIco(pngPath, icoPath);
  }
}

function getAppIcon() {
  const pngPath = getIconPngPath();
  if (fs.existsSync(pngPath)) {
    return nativeImage.createFromPath(pngPath);
  }
  return null;
}

function getTrayIcon() {
  const icon = getAppIcon();
  if (icon) {
    return icon.resize({ width: 24, height: 24 });
  }
  return null;
}

// ─── Desktop Shortcut (Windows – proper .lnk with .ico) ───────
function createDesktopShortcut() {
  if (process.platform !== 'win32') return;
  if (store.get('desktopShortcutCreated')) return;

  try {
    // Ensure ICO icon exists
    ensureIcoExists();

    const desktopDir = path.join(require('os').homedir(), 'Desktop');
    const electronExe = process.execPath;
    const appDir = __dirname;
    const icoPath = getIconIcoPath();
    const shortcutPath = path.join(desktopDir, 'Prompt Library.lnk');

    const shortcutOptions = {
      target: electronExe,
      args: `"${appDir}"`,
      cwd: appDir,
      description: 'Prompt Library',
      appUserModelId: 'com.promptlibrary.app'
    };

    // Only set icon if ICO exists
    if (fs.existsSync(icoPath)) {
      shortcutOptions.icon = icoPath;
      shortcutOptions.iconIndex = 0;
    }

    const success = shell.writeShortcutLink(shortcutPath, 'create', shortcutOptions);

    if (success) {
      store.set('desktopShortcutCreated', true);
      console.log('Desktop shortcut created:', shortcutPath);
    } else {
      console.error('shell.writeShortcutLink returned false');
    }
  } catch (e) {
    console.error('Could not create desktop shortcut:', e);
  }
}

// ─── Window ────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = store.get('windowBounds');
  const appIcon = getAppIcon();

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 550,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0e1015',
    icon: appIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('resize', () => {
    const { width, height } = mainWindow.getBounds();
    store.set('windowBounds', { width, height });
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── System Tray ───────────────────────────────────────────────
function createTray() {
  const trayIcon = getTrayIcon();
  if (!trayIcon) return;

  tray = new Tray(trayIcon);
  tray.setToolTip('Prompt Library');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Prompt Library',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  ensureIcoExists();
  createTray();
  createWindow();
  createDesktopShortcut();
});

app.on('window-all-closed', () => {
  // Stay in tray
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// ─── IPC Handlers ──────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// Folders
ipcMain.handle('get-folders', () => {
  return store.get('folders');
});

ipcMain.handle('create-folder', (_, name) => {
  const folders = store.get('folders');
  const newFolder = { id: genId(), name, prompts: [] };
  folders.push(newFolder);
  store.set('folders', folders);
  return folders;
});

ipcMain.handle('rename-folder', (_, { id, name }) => {
  const folders = store.get('folders');
  const folder = folders.find(f => f.id === id);
  if (folder) folder.name = name;
  store.set('folders', folders);
  return folders;
});

ipcMain.handle('delete-folder', (_, id) => {
  let folders = store.get('folders');
  folders = folders.filter(f => f.id !== id);
  store.set('folders', folders);
  return folders;
});

// Prompts
ipcMain.handle('create-prompt', (_, { folderId, name, text, tags, images }) => {
  const folders = store.get('folders');
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.prompts.push({
      id: genId(),
      name,
      text,
      tags: tags || [],
      images: images || [],
      createdAt: new Date().toISOString()
    });
  }
  store.set('folders', folders);
  return folders;
});

ipcMain.handle('update-prompt', (_, { folderId, promptId, name, text, tags, images }) => {
  const folders = store.get('folders');
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    const prompt = folder.prompts.find(p => p.id === promptId);
    if (prompt) {
      prompt.name = name;
      prompt.text = text;
      prompt.tags = tags || [];
      prompt.images = images || [];
    }
  }
  store.set('folders', folders);
  return folders;
});

ipcMain.handle('delete-prompt', (_, { folderId, promptId }) => {
  const folders = store.get('folders');
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.prompts = folder.prompts.filter(p => p.id !== promptId);
  }
  store.set('folders', folders);
  return folders;
});

ipcMain.handle('move-prompt', (_, { fromFolderId, toFolderId, promptId }) => {
  const folders = store.get('folders');
  const fromFolder = folders.find(f => f.id === fromFolderId);
  const toFolder = folders.find(f => f.id === toFolderId);
  if (fromFolder && toFolder) {
    const promptIndex = fromFolder.prompts.findIndex(p => p.id === promptId);
    if (promptIndex !== -1) {
      const [prompt] = fromFolder.prompts.splice(promptIndex, 1);
      toFolder.prompts.push(prompt);
    }
  }
  store.set('folders', folders);
  return folders;
});

// ─── Image Handling ────────────────────────────────────────────
ipcMain.handle('save-image', (_, { dataUrl }) => {
  const id = genId();
  const match = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
  if (!match) return null;

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const filename = `${id}.${ext}`;
  const filepath = path.join(imageDir, filename);

  fs.writeFileSync(filepath, Buffer.from(match[2], 'base64'));
  return { filename, filepath };
});

ipcMain.handle('get-image-path', (_, filename) => {
  return path.join(imageDir, filename);
});

ipcMain.handle('select-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) return [];

  const images = [];
  for (const filePath of result.filePaths) {
    const ext = path.extname(filePath).slice(1);
    const data = fs.readFileSync(filePath);
    const base64 = data.toString('base64');
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    const dataUrl = `data:image/${mimeType};base64,${base64}`;

    const id = genId();
    const filename = `${id}.${ext}`;
    const destPath = path.join(imageDir, filename);
    fs.copyFileSync(filePath, destPath);

    images.push({ filename, dataUrl });
  }

  return images;
});

ipcMain.handle('read-clipboard-image', () => {
  const img = clipboard.readImage();
  if (img.isEmpty()) return null;

  const dataUrl = img.toDataURL();
  const id = genId();
  const filename = `${id}.png`;
  const filepath = path.join(imageDir, filename);

  fs.writeFileSync(filepath, img.toPNG());
  return { filename, dataUrl };
});

// Clipboard
ipcMain.handle('copy-to-clipboard', (_, text) => {
  clipboard.writeText(text);
  return true;
});

// Theme
ipcMain.handle('get-theme', () => {
  return store.get('theme');
});

ipcMain.handle('set-theme', (_, theme) => {
  store.set('theme', theme);
  return theme;
});

// Window controls
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});
