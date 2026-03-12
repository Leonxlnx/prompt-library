/* ═══════════════════════════════════════════════════════════════
   Prompt Library – Application Logic
   Supports both Electron (window.api) and Tauri (window.__TAURI__)
   ═══════════════════════════════════════════════════════════════ */

async function invoke(cmd, args) {
    // ─── Electron path (window.api from preload.js) ────────────
    if (window.api) {
        const a = args || {};
        switch (cmd) {
            case 'get_folders':         return window.api.getFolders();
            case 'create_folder':       return window.api.createFolder(a.name);
            case 'rename_folder':       return window.api.renameFolder(a.id, a.name);
            case 'delete_folder':       return window.api.deleteFolder(a.id);
            case 'create_prompt':       return window.api.createPrompt(a.folderId, a.name, a.text, a.tags, a.images);
            case 'update_prompt':       return window.api.updatePrompt(a.folderId, a.promptId, a.name, a.text, a.tags, a.images);
            case 'delete_prompt':       return window.api.deletePrompt(a.folderId, a.promptId);
            case 'move_prompt':         return window.api.movePrompt(a.fromFolderId, a.toFolderId, a.promptId);
            case 'copy_to_clipboard':   return window.api.copyToClipboard(a.text);
            case 'save_image':          return window.api.saveImage(a.dataUrl);
            case 'select_images':       return window.api.selectImages();
            case 'get_image_path':      return window.api.getImagePath(a.filename);
            case 'read_clipboard_image': return window.api.readClipboardImage();
            case 'get_settings':        { const theme = await window.api.getTheme(); return { theme: theme || 'dark' }; }
            case 'set_theme':           return window.api.setTheme(a.theme);
            case 'window_minimize':     return window.api.minimize();
            case 'window_maximize':     return window.api.maximize();
            case 'window_close':        return window.api.close();
            case 'set_shortcut':        return null; // Not available in Electron
            default:                    console.warn('Unknown command:', cmd); return null;
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

    console.error('No API bridge available (neither Electron nor Tauri)');
    return null;
}

// ─── State ─────────────────────────────────────────────────────
let folders = [];
let activeFolderId = null;
let editingPromptId = null;
let contextFolderId = null;
let modalImages = []; // { filename, dataUrl }
let currentSort = 'newest';

// ─── DOM References ────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const folderList = $('#folderList');
const promptGrid = $('#promptGrid');
const emptyState = $('#emptyState');
const folderTitle = $('#folderTitle');
const folderBadge = $('#folderBadge');
const promptCount = $('#promptCount');
const searchInput = $('#searchInput');
const modalOverlay = $('#modalOverlay');
const modalTitle = $('#modalTitle');
const promptForm = $('#promptForm');
const folderForm = $('#folderForm');
const promptName = $('#promptName');
const promptText = $('#promptText');
const promptTags = $('#promptTags');
const imagePreviewList = $('#imagePreviewList');
const imageUploadZone = $('#imageUploadZone');
const imageUploadBtn = $('#imageUploadBtn');
const contextMenu = $('#contextMenu');
const toast = $('#toast');
const toastMessage = $('#toastMessage');
const lightboxOverlay = $('#lightboxOverlay');
const lightboxImg = $('#lightboxImg');
const lightboxClose = $('#lightboxClose');
const sidebar = $('#sidebar');
const sidebarCollapseBtn = $('#sidebarCollapseBtn');
const sidebarExpandBtn = $('#sidebarExpandBtn');
const confirmOverlay = $('#confirmOverlay');
const confirmTitle = $('#confirmTitle');
const confirmDesc = $('#confirmDesc');
const confirmOk = $('#confirmOk');
const confirmCancel = $('#confirmCancel');
const sortMenu = $('#sortMenu');
const sortBtn = $('#sortBtn');
const charCount = $('#charCount');
const charCounter = $('#charCounter');

// ─── Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) {
        const m = Math.floor(diff / 60000);
        return `${m}m ago`;
    }
    if (diff < 86400000) {
        const h = Math.floor(diff / 3600000);
        return `${h}h ago`;
    }
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days}d ago`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message = 'Copied to clipboard!') {
    toastMessage.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2200);
}

// ─── Confirmation Dialog ───────────────────────────────────────
let confirmResolve = null;

function showConfirm(title, desc) {
    confirmTitle.textContent = title;
    confirmDesc.textContent = desc;
    confirmOverlay.classList.add('active');
    return new Promise((resolve) => {
        confirmResolve = resolve;
    });
}

confirmOk.addEventListener('click', () => {
    confirmOverlay.classList.remove('active');
    if (confirmResolve) confirmResolve(true);
    confirmResolve = null;
});

confirmCancel.addEventListener('click', () => {
    confirmOverlay.classList.remove('active');
    if (confirmResolve) confirmResolve(false);
    confirmResolve = null;
});

confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) {
        confirmOverlay.classList.remove('active');
        if (confirmResolve) confirmResolve(false);
        confirmResolve = null;
    }
});

// ─── Sidebar Collapse / Expand ─────────────────────────────────
sidebarCollapseBtn.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    sidebarExpandBtn.style.display = 'flex';
});

sidebarExpandBtn.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    sidebarExpandBtn.style.display = 'none';
});

// ─── Lightbox ──────────────────────────────────────────────────
function openLightbox(src) {
    lightboxImg.src = src;
    lightboxOverlay.classList.add('active');
}

function closeLightbox() {
    lightboxOverlay.classList.remove('active');
    setTimeout(() => { lightboxImg.src = ''; }, 300);
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxOverlay.addEventListener('click', (e) => {
    if (e.target === lightboxOverlay) closeLightbox();
});

// ─── Render Functions ──────────────────────────────────────────
function renderFolders() {
    const totalPrompts = folders.reduce((sum, f) => sum + f.prompts.length, 0);
    promptCount.textContent = `${totalPrompts} prompt${totalPrompts !== 1 ? 's' : ''}`;

    folderList.innerHTML = folders.map(folder => `
    <div class="folder-item ${folder.id === activeFolderId ? 'active' : ''}"
         data-id="${folder.id}">
      <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="folder-name">${escapeHtml(folder.name)}</span>
      <span class="folder-count">${folder.prompts.length}</span>
    </div>
  `).join('');

    // Click handlers
    folderList.querySelectorAll('.folder-item').forEach(el => {
        el.addEventListener('click', () => {
            activeFolderId = el.dataset.id;
            renderFolders();
            renderPrompts();
        });
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            contextFolderId = el.dataset.id;
            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = e.clientY + 'px';
            contextMenu.classList.add('visible');
        });
    });
}

function renderPrompts() {
    const folder = folders.find(f => f.id === activeFolderId);
    if (!folder) return;

    folderTitle.textContent = folder.name;
    const query = searchInput.value.toLowerCase().trim();
    let prompts = folder.prompts;

    if (query) {
        prompts = prompts.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.text.toLowerCase().includes(query) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(query)))
        );
    }

    folderBadge.textContent = prompts.length;

    // Apply sort
    prompts = sortPrompts(prompts, currentSort);

    if (prompts.length === 0) {
        promptGrid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    promptGrid.style.display = 'grid';
    emptyState.style.display = 'none';

    promptGrid.innerHTML = prompts.map((p, i) => {
        const tagsHtml = (p.tags || [])
            .filter(t => t.trim())
            .map(t => `<span class="tag">${escapeHtml(t.trim())}</span>`)
            .join('');

        const imagesHtml = (p.images && p.images.length > 0)
            ? `<div class="card-images">${p.images.map((img, idx) => {
                const src = img.dataUrl || '';
                return `<img class="card-image-thumb" src="${src}" data-prompt-id="${p.id}" data-img-idx="${idx}" alt="Image ${idx + 1}">`;
            }).join('')}</div>`
            : '';

        const dateHtml = p.updated_at || p.created_at
            ? `<span class="card-date">${formatDate(p.updated_at || p.created_at)}</span>`
            : '';

        return `
      <div class="prompt-card" data-id="${p.id}" style="animation-delay: ${i * 0.06}s">
        <div class="card-header">
          <span class="card-name">${escapeHtml(p.name)}</span>
          <div class="card-actions">
            <button class="card-btn edit-btn" data-id="${p.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="card-btn copy-btn" data-id="${p.id}" title="Copy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button class="card-btn delete-btn" data-id="${p.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
        <p class="card-preview">${escapeHtml(p.text)}</p>
        ${imagesHtml}
        <div class="card-footer">
          <div class="card-tags">${tagsHtml}</div>
          ${dateHtml}
          <button class="card-copy-main" data-id="${p.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </button>
        </div>
      </div>
    `;
    }).join('');

    // Card action handlers
    promptGrid.querySelectorAll('.copy-btn, .card-copy-main').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const prompt = findPrompt(btn.dataset.id);
            if (prompt) {
                await invoke('copy_to_clipboard', { text: prompt.text });
                showToast();
            }
        });
    });

    promptGrid.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPromptModal(btn.dataset.id);
        });
    });

    // Delete with confirmation + animation
    promptGrid.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const promptId = btn.dataset.id;
            const prompt = findPrompt(promptId);
            const name = prompt ? prompt.name : 'this prompt';

            const confirmed = await showConfirm(
                `Delete "${name}"?`,
                'This prompt will be permanently removed.'
            );
            if (!confirmed) return;

            // Animate out
            const card = btn.closest('.prompt-card');
            if (card) {
                card.classList.add('card-removing');
                await new Promise(r => setTimeout(r, 320));
            }

            folders = await invoke('delete_prompt', { folderId: activeFolderId, promptId });
            renderFolders();
            renderPrompts();
        });
    });

    // Double-click to edit
    promptGrid.querySelectorAll('.prompt-card').forEach(card => {
        card.addEventListener('dblclick', (e) => {
            // Don't trigger if clicking buttons or images
            if (e.target.closest('.card-btn, .card-copy-main, .card-image-thumb')) return;
            openPromptModal(card.dataset.id);
        });
    });

    // Card image click → lightbox
    promptGrid.querySelectorAll('.card-image-thumb').forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            openLightbox(img.src);
        });
    });
}

function findPrompt(promptId) {
    const folder = folders.find(f => f.id === activeFolderId);
    if (!folder) return null;
    return folder.prompts.find(p => p.id === promptId);
}

// ─── Sort Logic ────────────────────────────────────────────────
function sortPrompts(prompts, mode) {
    const sorted = [...prompts];
    switch (mode) {
        case 'newest':
            sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            break;
        case 'oldest':
            sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            break;
        case 'name-asc':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            sorted.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'updated':
            sorted.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
            break;
    }
    return sorted;
}

// ─── Image Preview Management ──────────────────────────────────
function renderImagePreviews() {
    imagePreviewList.innerHTML = modalImages.map((img, idx) => `
    <div class="image-preview-item" data-idx="${idx}">
      <img src="${img.dataUrl}" alt="Preview ${idx + 1}">
      <button class="image-preview-remove" data-idx="${idx}">×</button>
    </div>
  `).join('');

    // Click to preview
    imagePreviewList.querySelectorAll('.image-preview-item img').forEach(imgEl => {
        imgEl.addEventListener('click', () => openLightbox(imgEl.src));
    });

    // Remove buttons
    imagePreviewList.querySelectorAll('.image-preview-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            modalImages.splice(idx, 1);
            renderImagePreviews();
        });
    });
}

async function addImageFromDataUrl(dataUrl) {
    const result = await invoke('save_image', { dataUrl });
    if (result) {
        modalImages.push({ filename: result.filename, dataUrl });
        renderImagePreviews();
    }
}

// ─── Modal ─────────────────────────────────────────────────────
let modalMode = 'prompt'; // 'prompt' | 'folder' | 'rename'

function openPromptModal(promptId = null) {
    modalMode = 'prompt';
    editingPromptId = promptId;
    promptForm.style.display = 'flex';
    folderForm.style.display = 'none';

    if (promptId) {
        const prompt = findPrompt(promptId);
        if (prompt) {
            modalTitle.textContent = 'Edit Prompt';
            promptName.value = prompt.name;
            promptText.value = prompt.text;
            promptTags.value = (prompt.tags || []).join(', ');
            modalImages = (prompt.images || []).map(img => ({ ...img }));
        }
    } else {
        modalTitle.textContent = 'New Prompt';
        promptName.value = '';
        promptText.value = '';
        promptTags.value = '';
        modalImages = [];
    }

    renderImagePreviews();
    updateCharCounter();
    modalOverlay.classList.add('active');
    setTimeout(() => promptName.focus(), 100);
}

function openFolderModal(rename = false, currentName = '') {
    modalMode = rename ? 'rename' : 'folder';
    promptForm.style.display = 'none';
    folderForm.style.display = 'flex';
    modalTitle.textContent = rename ? 'Rename Folder' : 'New Folder';
    const folderNameInput = $('#folderName');
    folderNameInput.value = currentName;
    modalOverlay.classList.add('active');
    setTimeout(() => folderNameInput.focus(), 100);
}

function closeModal() {
    modalOverlay.classList.remove('active');
    editingPromptId = null;
    modalImages = [];
}

async function saveModal() {
    if (modalMode === 'prompt') {
        const name = promptName.value.trim();
        const text = promptText.value.trim();
        const tags = promptTags.value.split(',').map(t => t.trim()).filter(Boolean);

        if (!name || !text) {
            promptName.focus();
            return;
        }

        if (editingPromptId) {
            folders = await invoke('update_prompt', { folderId: activeFolderId, promptId: editingPromptId, name, text, tags, images: modalImages });
        } else {
            folders = await invoke('create_prompt', { folderId: activeFolderId, name, text, tags, images: modalImages });
        }
    } else if (modalMode === 'folder') {
        const name = $('#folderName').value.trim();
        if (!name) return;
        folders = await invoke('create_folder', { name });
        activeFolderId = folders[folders.length - 1].id;
    } else if (modalMode === 'rename') {
        const name = $('#folderName').value.trim();
        if (!name) return;
        folders = await invoke('rename_folder', { id: contextFolderId, name });
    }

    closeModal();
    renderFolders();
    renderPrompts();
}

// ─── Image Upload Button ───────────────────────────────────────
imageUploadBtn.addEventListener('click', async () => {
    const images = await invoke('select_images');
    for (const img of images) {
        modalImages.push(img);
    }
    renderImagePreviews();
});

// ─── Drag & Drop on upload zone ────────────────────────────────
imageUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadZone.classList.add('drag-over');
});

imageUploadZone.addEventListener('dragleave', () => {
    imageUploadZone.classList.remove('drag-over');
});

imageUploadZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    imageUploadZone.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        await addImageFromDataUrl(dataUrl);
    }
});

function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

// ─── Ctrl+V Paste ──────────────────────────────────────────────
document.addEventListener('paste', async (e) => {
    // Only handle when modal is open
    if (!modalOverlay.classList.contains('active')) return;
    if (modalMode !== 'prompt') return;

    // Check for image in clipboard items
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));

    if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) {
            const dataUrl = await readFileAsDataUrl(file);
            await addImageFromDataUrl(dataUrl);
            showToast('Image pasted!');
            return;
        }
    }

    // Also try Tauri clipboard (for screenshots)
    const result = await invoke('read_clipboard_image');
    if (result) {
        e.preventDefault();
        modalImages.push(result);
        renderImagePreviews();
        showToast('Image pasted!');
    }
});

// ─── Character Counter ─────────────────────────────────────────
function updateCharCounter() {
    const len = promptText.value.length;
    charCount.textContent = len.toLocaleString();
    charCounter.classList.remove('warning', 'danger');
    if (len > 8000) charCounter.classList.add('danger');
    else if (len > 4000) charCounter.classList.add('warning');
}

promptText.addEventListener('input', updateCharCounter);

// ─── Sort Dropdown ─────────────────────────────────────────────
sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle('visible');
});

sortMenu.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSort = opt.dataset.sort;
        sortMenu.querySelectorAll('.sort-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        sortMenu.classList.remove('visible');
        renderPrompts();
    });
});

// ─── Event Listeners ───────────────────────────────────────────
$('#addPromptBtn').addEventListener('click', () => openPromptModal());
$('#addFolderBtn').addEventListener('click', () => openFolderModal());
$('#modalClose').addEventListener('click', closeModal);
$('#modalCancel').addEventListener('click', closeModal);
$('#modalSave').addEventListener('click', saveModal);

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

// Context menu
$('#ctxRename').addEventListener('click', () => {
    const folder = folders.find(f => f.id === contextFolderId);
    if (folder) openFolderModal(true, folder.name);
    contextMenu.classList.remove('visible');
});

// Delete folder with confirmation
$('#ctxDelete').addEventListener('click', async () => {
    contextMenu.classList.remove('visible');
    if (!contextFolderId) return;

    const folder = folders.find(f => f.id === contextFolderId);
    const name = folder ? folder.name : 'this folder';
    const count = folder ? folder.prompts.length : 0;

    const confirmed = await showConfirm(
        `Delete "${name}"?`,
        count > 0
            ? `This folder contains ${count} prompt${count !== 1 ? 's' : ''} that will also be deleted.`
            : 'This empty folder will be permanently removed.'
    );
    if (!confirmed) return;

    folders = await invoke('delete_folder', { id: contextFolderId });
    if (activeFolderId === contextFolderId && folders.length > 0) {
        activeFolderId = folders[0].id;
    }
    renderFolders();
    renderPrompts();
});

document.addEventListener('click', () => {
    contextMenu.classList.remove('visible');
    sortMenu.classList.remove('visible');
});

// Search
searchInput.addEventListener('input', () => {
    renderPrompts();
});

// Theme toggle
$('#themeToggle').addEventListener('click', async () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    await invoke('set_theme', { theme: next });
});

// Window controls
$('#winMinimize').addEventListener('click', () => invoke('window_minimize'));
$('#winMaximize').addEventListener('click', () => invoke('window_maximize'));
$('#winClose').addEventListener('click', () => invoke('window_close'));

// ─── Settings Panel ─────────────────────────────────────────────
const settingsOverlay = $('#settingsOverlay');
const shortcutDisplay = $('#shortcutDisplay');
const shortcutRecorder = $('#shortcutRecorder');
const recorderKeys = $('#recorderKeys');
let isRecording = false;
let recordedShortcut = '';

$('#settingsBtn').addEventListener('click', async () => {
    const settings = await invoke('get_settings');
    if (settings) {
        shortcutDisplay.textContent = settings.shortcut || 'CommandOrControl+Shift+S';
    }
    settingsOverlay.classList.add('active');
});

$('#settingsClose').addEventListener('click', () => {
    settingsOverlay.classList.remove('active');
    stopRecording();
});

settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
        settingsOverlay.classList.remove('active');
        stopRecording();
    }
});

$('#shortcutRecordBtn').addEventListener('click', () => {
    shortcutRecorder.style.display = 'flex';
    isRecording = true;
    recordedShortcut = '';
    recorderKeys.textContent = 'Waiting...';
});

$('#recorderCancel').addEventListener('click', () => {
    stopRecording();
});

$('#recorderSave').addEventListener('click', async () => {
    if (!recordedShortcut) return;
    try {
        await invoke('set_shortcut', { shortcut: recordedShortcut });
        shortcutDisplay.textContent = recordedShortcut;
        showToast('Shortcut updated!');
    } catch (e) {
        showToast('Invalid shortcut: ' + e);
    }
    stopRecording();
});

function stopRecording() {
    isRecording = false;
    shortcutRecorder.style.display = 'none';
    recordedShortcut = '';
}

document.addEventListener('keydown', (e) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    // Build the shortcut string in Tauri format
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // Map the actual key
    const key = e.key;
    const ignoredKeys = ['Control', 'Meta', 'Alt', 'Shift'];
    if (ignoredKeys.includes(key)) {
        recorderKeys.textContent = parts.join('+') + '+...';
        return;
    }

    // Map special keys
    const keyMap = {
        ' ': 'Space',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
        'Enter': 'Enter',
        'Backspace': 'Backspace',
        'Delete': 'Delete',
        'Tab': 'Tab',
        'Escape': 'Escape',
    };

    const mappedKey = keyMap[key] || key.toUpperCase();
    parts.push(mappedKey);

    recordedShortcut = parts.join('+');
    recorderKeys.textContent = recordedShortcut;
}, true);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (isRecording) return; // Don't process normal shortcuts while recording

    // Escape closes overlays
    if (e.key === 'Escape') {
        if (confirmOverlay.classList.contains('active')) {
            confirmOverlay.classList.remove('active');
            if (confirmResolve) confirmResolve(false);
            confirmResolve = null;
        } else if (settingsOverlay.classList.contains('active')) {
            settingsOverlay.classList.remove('active');
            stopRecording();
        } else if (lightboxOverlay.classList.contains('active')) {
            closeLightbox();
        } else if (modalOverlay.classList.contains('active')) {
            closeModal();
        }
        contextMenu.classList.remove('visible');
    }

    // Ctrl+N → new prompt
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openPromptModal();
    }

    // Ctrl+Enter → save modal
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (modalOverlay.classList.contains('active')) {
            e.preventDefault();
            saveModal();
        }
    }

    // Ctrl+F → focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInput.focus();
    }

    // Ctrl+B → toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            sidebarExpandBtn.style.display = 'none';
        } else {
            sidebar.classList.add('collapsed');
            sidebarExpandBtn.style.display = 'flex';
        }
    }
});

// ─── Init ──────────────────────────────────────────────────────
async function init() {
    folders = await invoke('get_folders');
    const settings = await invoke('get_settings');
    document.documentElement.setAttribute('data-theme', settings?.theme || 'dark');

    if (folders.length > 0) {
        activeFolderId = folders[0].id;
    }

    renderFolders();
    renderPrompts();
}

init();
