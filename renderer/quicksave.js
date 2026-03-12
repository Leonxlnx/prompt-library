/* ═══════════════════════════════════════════════════════════════
   Quick Save – Compact prompt saver
   Supports both Electron (window.api) and Tauri (window.__TAURI__)
   ═══════════════════════════════════════════════════════════════ */

async function invoke(cmd, args) {
    // ─── Electron path ─────────────────────────────────────────
    if (window.api) {
        const a = args || {};
        switch (cmd) {
            case 'get_folders':          return window.api.getFolders();
            case 'get_settings':         { const theme = await window.api.getTheme(); return { theme: theme || 'dark' }; }
            case 'create_prompt':        return window.api.createPrompt(a.folderId, a.name, a.text, a.tags, a.images);
            case 'close_quicksave':      return window.api.close();
            default:                     console.warn('QS: Unknown command:', cmd); return null;
        }
    }

    // ─── Tauri path ────────────────────────────────────────────
    if (window.__TAURI__ && window.__TAURI__.core) {
        return window.__TAURI__.core.invoke(cmd, args);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    if (window.__TAURI__ && window.__TAURI__.core) {
        return window.__TAURI__.core.invoke(cmd, args);
    }

    console.error('No API bridge available');
    return null;
}

// ─── DOM ────────────────────────────────────────────────────────
const qsFolder = document.getElementById('qsFolder');
const qsName = document.getElementById('qsName');
const qsText = document.getElementById('qsText');
const qsSave = document.getElementById('qsSave');
const qsCancel = document.getElementById('qsCancel');
const qsClose = document.getElementById('qsClose');
const qsToast = document.getElementById('qsToast');

// ─── Auto-Resize Textarea ──────────────────────────────────────
function autoResize() {
    qsText.style.height = 'auto';
    const maxH = window.innerHeight * 0.55;
    qsText.style.height = Math.min(qsText.scrollHeight, maxH) + 'px';
}

qsText.addEventListener('input', autoResize);

// ─── Init ───────────────────────────────────────────────────────
async function init() {
    // Load theme
    const settings = await invoke('get_settings');
    if (settings) {
        document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
    }

    // Load folders
    const folders = await invoke('get_folders');
    if (folders && folders.length > 0) {
        qsFolder.innerHTML = folders.map(f =>
            `<option value="${f.id}">${f.name} (${f.prompts.length})</option>`
        ).join('');

        // Pre-select the most recently used folder
        const lastFolderId = localStorage.getItem('qs_last_folder');
        if (lastFolderId && folders.some(f => f.id === lastFolderId)) {
            qsFolder.value = lastFolderId;
        }
    } else {
        qsFolder.innerHTML = '<option value="">No folders</option>';
    }

    // Auto-focus the prompt text directly
    setTimeout(() => qsText.focus(), 150);
}

// ─── Save ───────────────────────────────────────────────────────
async function savePrompt() {
    const folderId = qsFolder.value;
    const text = qsText.value.trim();
    // Name is optional - auto-generate from text if empty
    let name = qsName.value.trim();

    if (!folderId) return;
    if (!text) {
        qsText.focus();
        return;
    }

    if (!name) {
        name = text.substring(0, 35).replace(/\n/g, ' ');
        if (text.length > 35) name += '…';
    }

    // Remember the folder for next time
    localStorage.setItem('qs_last_folder', folderId);

    await invoke('create_prompt', {
        folderId: folderId,
        name: name,
        text: text,
        tags: [],
        images: [],
    });

    // Show success toast then close
    qsToast.classList.add('visible');
    setTimeout(async () => {
        await invoke('close_quicksave');
    }, 600);
}

// ─── Close ──────────────────────────────────────────────────────
async function closeWindow() {
    await invoke('close_quicksave');
}

// ─── Event Listeners ────────────────────────────────────────────
qsSave.addEventListener('click', savePrompt);
qsCancel.addEventListener('click', closeWindow);
qsClose.addEventListener('click', closeWindow);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeWindow();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        savePrompt();
    }
});

// ─── Boot ───────────────────────────────────────────────────────
init();
