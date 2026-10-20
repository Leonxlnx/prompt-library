/* ═══════════════════════════════════════════════════════════════
   Prompt Library – Application Logic (Tauri v2)
   ═══════════════════════════════════════════════════════════════ */

// ─── Platform Detection ────────────────────────────────────────
// Tag the document so CSS can render native chrome conventions
// (traffic-light style buttons on macOS, sharper right-side controls on Windows).
(function detectPlatform() {
    const ua = (navigator.userAgent || '').toLowerCase();
    const platform = (navigator.platform || '').toLowerCase();
    let p = 'windows';
    if (ua.includes('mac') || platform.includes('mac') || ua.includes('iphone') || ua.includes('ipad')) {
        p = 'macos';
    } else if (ua.includes('linux')) {
        p = 'linux';
    }
    document.documentElement.setAttribute('data-platform', p);
})();

async function invoke(cmd, args) {
    // Wait for Tauri to be ready (up to 2 seconds)
    for (let i = 0; i < 20; i++) {
        if (window.__TAURI__ && window.__TAURI__.core) {
            return window.__TAURI__.core.invoke(cmd, args);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.error('Tauri API not available for command:', cmd);
    return null;
}

// Helper to convert a local file path to a URL the webview can load
function filePathToUrl(filePath) {
    if (!filePath) return '';
    // Tauri v2: use convertFileSrc if available, otherwise use asset:// protocol
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.convertFileSrc) {
        return window.__TAURI__.core.convertFileSrc(filePath);
    }
    // Fallback: convert path to asset:// URL
    const normalized = filePath.replace(/\\/g, '/');
    return 'asset://localhost/' + normalized;
}

// ─── State ─────────────────────────────────────────────────────
let folders = [];
let activeFolderId = null;
let editingPromptId = null;
let contextFolderId = null;
let modalImages = []; // { filename, dataUrl }
let currentSort = 'newest';
let appSettings = {
    theme: 'dark',
    shortcut: 'CommandOrControl+Shift+S',
    sidebar_background: '',
    main_background: '',
    glass_mode: 'apple',
    surface_opacity: 0.82,
    surface_brightness: 1,
    card_opacity: 0.78,
    glass_blur: 14,
    background_visibility: 0.24,
    accent_color: '#79BFFF',
    fit_cards_to_window: false,
};
let settingsDraft = null;
let settingsDirty = false;
let pendingWorkspaceBackground = '';

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
const mainContent = $('#mainContent');
const appLayout = $('.app-layout');
const fitCardsToWindowCheckbox = $('#fitCardsToWindow');
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
const workspaceBgPreview = $('#workspaceBgPreview');
const workspaceBgStatus = $('#workspaceBgStatus');
const workspaceBgUploadBtn = $('#workspaceBgUploadBtn');
const workspaceBgClearBtn = $('#workspaceBgClearBtn');
const themeTransitionLayer = $('#themeTransitionLayer');
const appBackground = $('#appBackground');
const themeToggleBtn = $('#themeToggle');
const surfaceGlassSlider = $('#surfaceGlassSlider');
const surfaceBrightnessSlider = $('#surfaceBrightnessSlider');
const bgVisibilitySlider = $('#bgVisibilitySlider');
const surfaceGlassValue = $('#surfaceGlassValue');
const surfaceBrightnessValue = $('#surfaceBrightnessValue');
const bgVisibilityValue = $('#bgVisibilityValue');
const accentColorPicker = $('#accentColorPicker');
const accentColorValue = $('#accentColorValue');
const accentColorChip = $('#accentColorChip');

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

function escapeCssUrl(url) {
    return String(url || '').replace(/"/g, '\\"');
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function sanitizeHexColor(value, fallback = '#79BFFF') {
    const normalized = String(value || '').trim();
    const match = normalized.match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return fallback.toUpperCase();
    return `#${match[1].toUpperCase()}`;
}

function hexToRgb(hex) {
    const normalized = sanitizeHexColor(hex).slice(1);
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function mixRgb(a, b, weight = 0.5) {
    const amount = clampNumber(weight, 0, 1, 0.5);
    return {
        r: Math.round(a.r + (b.r - a.r) * amount),
        g: Math.round(a.g + (b.g - a.g) * amount),
        b: Math.round(a.b + (b.b - a.b) * amount),
    };
}

function rgbToCss(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function rgbaToCss(rgb, alpha) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

async function resolveStoredImageUrl(filename) {
    if (!filename) return '';
    const path = await invoke('get_image_path', { filename });
    return path ? filePathToUrl(path) : '';
}

function getWorkspaceBackgroundFilename(settings = appSettings) {
    return settings?.main_background || settings?.sidebar_background || '';
}

function applyWorkspaceBackground(imageUrl) {
    const backgroundValue = imageUrl ? `url("${escapeCssUrl(imageUrl)}")` : 'none';
    document.body.style.setProperty('--workspace-bg-image', backgroundValue);
    appBackground?.style.setProperty('--app-bg-image', backgroundValue);
}

function updateBackgroundPreview(previewEl, statusEl, clearBtn, imageUrl, hasImage, areaLabel) {
    if (!previewEl || !statusEl || !clearBtn) return;
    previewEl.style.setProperty('--preview-image', imageUrl ? `url("${escapeCssUrl(imageUrl)}")` : 'none');
    previewEl.classList.toggle('is-empty', !hasImage);

    const label = previewEl.querySelector('span');
    if (label) {
        label.textContent = hasImage ? 'Custom image' : 'No image';
    }

    statusEl.textContent = hasImage ? `${areaLabel} background active` : 'No image selected';
    clearBtn.disabled = !hasImage;
}

async function previewWorkspaceBackground(backgroundFilename) {
    const backgroundUrl = await resolveStoredImageUrl(backgroundFilename);

    applyWorkspaceBackground(backgroundUrl);
    document.body.classList.toggle('has-workspace-image', !!backgroundFilename);
    updateBackgroundPreview(
        workspaceBgPreview,
        workspaceBgStatus,
        workspaceBgClearBtn,
        backgroundUrl,
        !!backgroundFilename,
        'Window'
    );
}

async function applyWorkspaceBackgrounds(settings = appSettings) {
    await previewWorkspaceBackground(getWorkspaceBackgroundFilename(settings));
}

function normalizeGlassSettings(settings = appSettings) {
    const glassMode = 'apple';
    const surfaceOpacity = clampNumber(settings.surface_opacity, 0.08, 0.98, 0.82);
    const surfaceBrightness = clampNumber(settings.surface_brightness, 0.72, 1.38, 1);
    const backgroundVisibility = clampNumber(settings.background_visibility, 0, 1, 0.24);
    const revealRatio = backgroundVisibility;
    const brightnessRatio = clampNumber((surfaceBrightness - 0.72) / 0.66, 0, 1, 0.42);
    const cardOpacity = clampNumber(
        surfaceOpacity + 0.04 - revealRatio * 0.07,
        0.18,
        0.96,
        0.78
    );
    const glassBlur = Math.round(clampNumber(
        9 + (1 - revealRatio) * 7 + surfaceOpacity * 5 + (surfaceBrightness - 1) * 10,
        6,
        26,
        14
    ));
    const accentColor = sanitizeHexColor(settings.accent_color, '#79BFFF');
    const glassEdgeOpacity = clampNumber(0.08 + brightnessRatio * 0.08, 0.08, 0.18, 0.14);
    const glassHighlightOpacity = clampNumber(0.1 + brightnessRatio * 0.16, 0.1, 0.28, 0.18);
    const surfaceTopGlowOpacity = clampNumber(0.04 + brightnessRatio * 0.15, 0.04, 0.2, 0.08);

    return {
        ...settings,
        glass_mode: glassMode,
        surface_opacity: surfaceOpacity,
        surface_brightness: surfaceBrightness,
        card_opacity: cardOpacity,
        glass_blur: glassBlur,
        background_visibility: backgroundVisibility,
        accent_color: accentColor,
        glass_edge_opacity: glassEdgeOpacity,
        glass_highlight_opacity: glassHighlightOpacity,
        surface_top_glow_opacity: surfaceTopGlowOpacity,
    };
}

function syncGlassControls(settings = appSettings) {
    const normalized = normalizeGlassSettings(settings);
    const surfaceOpacity = Math.round(normalized.surface_opacity * 100);
    const surfaceBrightness = Math.round(normalized.surface_brightness * 100);
    const backgroundVisibility = Math.round(normalized.background_visibility * 100);
    const accentColor = normalized.accent_color;

    if (surfaceGlassSlider) surfaceGlassSlider.value = String(surfaceOpacity);
    if (surfaceBrightnessSlider) surfaceBrightnessSlider.value = String(surfaceBrightness);
    if (bgVisibilitySlider) bgVisibilitySlider.value = String(backgroundVisibility);
    if (accentColorPicker) accentColorPicker.value = accentColor.toLowerCase();

    if (surfaceGlassValue) surfaceGlassValue.textContent = `${surfaceOpacity}%`;
    if (surfaceBrightnessValue) surfaceBrightnessValue.textContent = `${surfaceBrightness}%`;
    if (bgVisibilityValue) bgVisibilityValue.textContent = `${backgroundVisibility}%`;
    if (accentColorValue) accentColorValue.textContent = accentColor;
    if (accentColorChip) accentColorChip.style.background = accentColor;
}

function applyAccentColor(settings = appSettings) {
    const accentColor = sanitizeHexColor(settings.accent_color, '#79BFFF');
    const base = hexToRgb(accentColor);
    const white = { r: 255, g: 255, b: 255 };
    const deepBlue = { r: 25, g: 58, b: 108 };
    const inkBlue = { r: 23, g: 50, b: 78 };
    const accentHover = mixRgb(base, white, 0.12);
    const accentText = document.documentElement.getAttribute('data-theme') === 'light'
        ? rgbToCss(mixRgb(base, inkBlue, 0.58))
        : rgbToCss(mixRgb(base, white, 0.5));
    const buttonStart = mixRgb(base, white, 0.28);
    const buttonMid = mixRgb(base, white, 0.1);
    const buttonEnd = mixRgb(base, deepBlue, 0.24);
    const buttonStartHover = mixRgb(buttonStart, white, 0.12);
    const buttonMidHover = mixRgb(buttonMid, white, 0.1);
    const buttonEndHover = mixRgb(buttonEnd, white, 0.08);

    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-hover', rgbToCss(accentHover));
    document.documentElement.style.setProperty('--accent-subtle', rgbaToCss(base, 0.14));
    document.documentElement.style.setProperty('--accent-glow', rgbaToCss(base, 0.2));
    document.documentElement.style.setProperty('--accent-text', accentText);
    document.documentElement.style.setProperty('--accent-ring', rgbaToCss(base, 0.24));
    document.documentElement.style.setProperty(
        '--button-accent',
        `linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.06) 34%, rgba(255, 255, 255, 0) 100%), linear-gradient(180deg, ${rgbToCss(buttonStart)} 0%, ${rgbToCss(buttonMid)} 48%, ${rgbToCss(buttonEnd)} 100%)`
    );
    document.documentElement.style.setProperty(
        '--button-accent-hover',
        `linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.08) 34%, rgba(255, 255, 255, 0) 100%), linear-gradient(180deg, ${rgbToCss(buttonStartHover)} 0%, ${rgbToCss(buttonMidHover)} 48%, ${rgbToCss(buttonEndHover)} 100%)`
    );
}

function applyGlassSettings(settings = appSettings) {
    const normalizedSettings = normalizeGlassSettings(settings);
    const surfaceOpacity = normalizedSettings.surface_opacity;
    const cardOpacity = normalizedSettings.card_opacity;
    const glassBlur = normalizedSettings.glass_blur;
    const backgroundVisibility = normalizedSettings.background_visibility;
    const glassEdgeOpacity = normalizedSettings.glass_edge_opacity;
    const glassHighlightOpacity = normalizedSettings.glass_highlight_opacity;
    const surfaceTopGlowOpacity = normalizedSettings.surface_top_glow_opacity;

    document.documentElement.removeAttribute('data-glass-style');
    document.documentElement.style.setProperty('--surface-glass-opacity', surfaceOpacity.toFixed(2));
    document.documentElement.style.setProperty('--card-glass-opacity', cardOpacity.toFixed(2));
    document.documentElement.style.setProperty('--glass-blur-strength', `${glassBlur}px`);
    document.documentElement.style.setProperty('--background-image-strength', backgroundVisibility.toFixed(2));
    document.documentElement.style.setProperty('--glass-edge-opacity', glassEdgeOpacity.toFixed(2));
    document.documentElement.style.setProperty('--glass-highlight-opacity', glassHighlightOpacity.toFixed(2));
    document.documentElement.style.setProperty('--surface-top-glow-opacity', surfaceTopGlowOpacity.toFixed(2));

    applyAccentColor(normalizedSettings);
    syncGlassControls(normalizedSettings);
    return normalizedSettings;
}

function collectGlassSettingsFromControls() {
    return normalizeGlassSettings({
        glass_mode: 'apple',
        surface_opacity: clampNumber((surfaceGlassSlider?.value || 82) / 100, 0.08, 0.98, 0.82),
        surface_brightness: clampNumber((surfaceBrightnessSlider?.value || 100) / 100, 0.72, 1.38, 1),
        background_visibility: clampNumber((bgVisibilitySlider?.value || 24) / 100, 0, 1, 0.24),
        accent_color: sanitizeHexColor(accentColorPicker?.value, '#79BFFF'),
    });
}
// Unchecked (default) = cards keep a minimum height and the grid scrolls.
// Checked = original behaviour: cards shrink to fit the window.
function applyCardLayoutSetting(settings = appSettings) {
    const fitCards = !!settings.fit_cards_to_window;
    mainContent.classList.toggle('has-scrolling-cards', !fitCards);
    if (fitCardsToWindowCheckbox) fitCardsToWindowCheckbox.checked = fitCards;
}
async function hydrateSettings(settings) {
    if (!settings) return;
    appSettings = { ...appSettings, ...settings };
    document.documentElement.setAttribute('data-theme', appSettings.theme || 'dark');

    if (typeof shortcutDisplay !== 'undefined' && shortcutDisplay) {
        shortcutDisplay.textContent = appSettings.shortcut || 'CommandOrControl+Shift+S';
    }

    appSettings = applyGlassSettings(appSettings);
    applyCardLayoutSetting(appSettings);
    await applyWorkspaceBackgrounds(appSettings);
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
let layoutRefreshTimer = null;
let sidebarRevealTimer = null;

function refreshWorkspaceLayout() {
    mainContent.classList.add('is-layout-shifting');
    clearTimeout(layoutRefreshTimer);
    layoutRefreshTimer = setTimeout(() => {
        mainContent.classList.remove('is-layout-shifting');
        window.dispatchEvent(new Event('resize'));
    }, 380);
}

function playSidebarReveal() {
    clearTimeout(sidebarRevealTimer);
    sidebar.classList.remove('is-revealing');
    void sidebar.offsetWidth;
    sidebar.classList.add('is-revealing');
    sidebarRevealTimer = setTimeout(() => {
        sidebar.classList.remove('is-revealing');
    }, 520);
}

function setSidebarCollapsed(collapsed) {
    const wasCollapsed = sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    appLayout.classList.toggle('sidebar-collapsed', collapsed);
    sidebarExpandBtn.classList.toggle('is-visible', collapsed);
    if (!collapsed && wasCollapsed) {
        playSidebarReveal();
    }
    refreshWorkspaceLayout();
}

sidebarCollapseBtn.addEventListener('click', () => setSidebarCollapsed(true));
sidebarExpandBtn.addEventListener('click', () => setSidebarCollapsed(false));

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

    folderList.innerHTML = folders.map((folder, index) => {
        const colorDot = folder.color
            ? `<span class="folder-color-dot" style="background:${folder.color}"></span>`
            : '';
        return `
        <div class="folder-item ${folder.id === activeFolderId ? 'active' : ''}"
             data-id="${folder.id}" draggable="true" style="--stagger:${index + 1}">
          ${colorDot}
          <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="folder-name">${escapeHtml(folder.name)}</span>
          <span class="folder-count">${folder.prompts.length}</span>
        </div>
      `;
    }).join('');

    // Click + context menu handlers
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

        // ── Folder drag & drop reorder ──
        el.addEventListener('dragstart', (e) => {
            const payload = JSON.stringify({ type: 'folder', folderId: el.dataset.id });
            e.dataTransfer.setData('text/plain', payload);
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('dragging');
        });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', async (e) => {
            e.preventDefault();
            el.classList.remove('drag-over');

            let payload;
            try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }

            // Handle prompt drop (move between folders)
            if (payload.type === 'prompt') {
                const toFolderId = el.dataset.id;
                if (payload.fromFolderId !== toFolderId) {
                    folders = await invoke('move_prompt', { fromFolderId: payload.fromFolderId, toFolderId, promptId: payload.promptId });
                    renderFolders();
                    renderPrompts();
                    showToast('Prompt moved!');
                }
                return;
            }

            // Handle folder reorder
            if (payload.type === 'folder') {
                if (!payload.folderId || payload.folderId === el.dataset.id) return;
                const ids = folders.map(f => f.id);
                const fromIdx = ids.indexOf(payload.folderId);
                const toIdx = ids.indexOf(el.dataset.id);
                if (fromIdx === -1 || toIdx === -1) return;
                ids.splice(fromIdx, 1);
                ids.splice(toIdx, 0, payload.folderId);
                folders = await invoke('reorder_folders', { folderIds: ids });
                renderFolders();
                renderPrompts();
            }
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
        const allTags = (p.tags || []).filter(t => t.trim());
        const visibleTags = allTags.slice(0, 3);
        const extraCount = allTags.length - 3;
        let tagsHtml = visibleTags
            .map(t => `<span class="tag">${escapeHtml(t.trim())}</span>`)
            .join('');
        if (extraCount > 0) {
            tagsHtml += `<span class="tag tag-more">+${extraCount} more</span>`;
        }

        const imagesHtml = (p.images && p.images.length > 0)
            ? `<div class="card-images">${p.images.map((img, idx) => {
                return `<img class="card-image-thumb" src="" data-filename="${img}" data-prompt-id="${p.id}" data-img-idx="${idx}" alt="Image ${idx + 1}">`;
            }).join('')}</div>`
            : '';

        const dateHtml = p.updated_at || p.created_at
            ? `<span class="card-date">${formatDate(p.updated_at || p.created_at)}</span>`
            : '';

        const folder = folders.find(f => f.id === activeFolderId);
        const colorStripe = (folder && folder.color)
            ? `<div class="card-color-stripe" style="background:${folder.color}"></div>`
            : '';

        const starClass = p.favorite ? 'star-btn active' : 'star-btn';

        return `
      <div class="prompt-card${p.favorite ? ' is-favorite' : ''}" data-id="${p.id}" style="animation-delay: ${i * 0.06}s" draggable="true">
        ${colorStripe}
        <div class="card-header">
          <span class="card-name">${escapeHtml(p.name)}</span>
          <div class="card-actions">
            <button class="card-btn ${starClass}" data-id="${p.id}" title="${p.favorite ? 'Unpin' : 'Pin'}">
              <svg viewBox="0 0 24 24" fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
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

    // Star / Favorite toggle
    promptGrid.querySelectorAll('.star-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            folders = await invoke('toggle_favorite', { folderId: activeFolderId, promptId: btn.dataset.id });
            renderPrompts();
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
            if (e.target.closest('.card-btn, .card-copy-main, .card-image-thumb, .star-btn')) return;
            openPromptModal(card.dataset.id);
        });

        // ── Prompt drag & drop (move between folders) ──
        card.addEventListener('dragstart', (e) => {
            const payload = JSON.stringify({ type: 'prompt', fromFolderId: activeFolderId, promptId: card.dataset.id });
            e.dataTransfer.setData('text/plain', payload);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    // Load images from filenames and setup lightbox
    promptGrid.querySelectorAll('.card-image-thumb').forEach(async (img) => {
        const filename = img.dataset.filename;
        if (filename) {
            if (filename.startsWith('data:')) {
                img.src = filename;
            } else {
                const path = await invoke('get_image_path', { filename });
                if (path) img.src = filePathToUrl(path);
            }
        }
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
    imagePreviewList.innerHTML = modalImages.map((img, idx) => {
        const src = img._previewUrl || '';
        return `
    <div class="image-preview-item" data-idx="${idx}">
      <img src="${src}" alt="Preview ${idx + 1}">
      <button class="image-preview-remove" data-idx="${idx}">×</button>
    </div>
  `;
    }).join('');

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
    if (result && result.filename) {
        modalImages.push({ filename: result.filename, _previewUrl: dataUrl });
        renderImagePreviews();
    }
}

// ─── Modal ─────────────────────────────────────────────────────
let modalMode = 'prompt'; // 'prompt' | 'folder' | 'rename'

async function openPromptModal(promptId = null) {
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
            // Load images: each is a filename string, resolve for preview
            modalImages = [];
            for (const img of (prompt.images || [])) {
                const filename = typeof img === 'string' ? img : img.filename;
                if (filename && filename.startsWith('data:')) {
                    modalImages.push({ filename, _previewUrl: filename });
                } else if (filename) {
                    const path = await invoke('get_image_path', { filename });
                    const previewUrl = path ? filePathToUrl(path) : '';
                    modalImages.push({ filename, _previewUrl: previewUrl });
                }
            }
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

        // Extract filenames for storage (not dataUrls)
        const imageFilenames = modalImages.map(img => typeof img === 'string' ? img : (img.filename || img));

        if (editingPromptId) {
            folders = await invoke('update_prompt', { folderId: activeFolderId, promptId: editingPromptId, name, text, tags, images: imageFilenames });
        } else {
            folders = await invoke('create_prompt', { folderId: activeFolderId, name, text, tags, images: imageFilenames });
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
    const result = await invoke('select_images');
    if (result && Array.isArray(result)) {
        for (const img of result) {
            if (img && img.filename) {
                modalImages.push({ filename: img.filename, _previewUrl: img.data_url || '' });
            }
        }
        renderImagePreviews();
    }
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
    if (result && result.filename) {
        e.preventDefault();
        modalImages.push({ filename: result.filename, _previewUrl: result.data_url || '' });
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

// Folder color swatches in context menu
document.querySelectorAll('#ctxColors .color-swatch').forEach(swatch => {
    swatch.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!contextFolderId) return;
        const color = swatch.dataset.color;
        folders = await invoke('set_folder_color', { id: contextFolderId, color });
        contextMenu.classList.remove('visible');
        renderFolders();
        renderPrompts();
    });
});

// Search
searchInput.addEventListener('input', () => {
    renderPrompts();
});

// Theme toggle
themeToggleBtn?.addEventListener('click', () => {
    toggleThemeWithReveal(themeToggleBtn);
});

// Window controls
$('#winMinimize').addEventListener('click', () => invoke('window_minimize'));
$('#winMaximize').addEventListener('click', () => invoke('window_maximize'));
$('#winClose').addEventListener('click', () => invoke('window_close'));

// ─── Settings Panel ─────────────────────────────────────────────
const settingsOverlay = $('#settingsOverlay');
const settingsSaveBtn = $('#settingsSaveBtn');
const settingsCancelBtn = $('#settingsCancelBtn');
const settingsSaveState = $('#settingsSaveState');
const shortcutDisplay = $('#shortcutDisplay');
const shortcutRecorder = $('#shortcutRecorder');
const recorderKeys = $('#recorderKeys');
let isRecording = false;
let recordedShortcut = '';

function updateSettingsSaveState() {
    if (!settingsSaveBtn || !settingsCancelBtn || !settingsSaveState) return;
    settingsSaveBtn.disabled = !settingsDirty;
    settingsCancelBtn.disabled = false;
    settingsSaveState.textContent = settingsDirty
        ? 'Unsaved changes'
        : 'Saved';
}

function setSettingsDirty(dirty) {
    settingsDirty = dirty;
    updateSettingsSaveState();
}

function startSettingsDraft() {
    settingsDraft = { ...appSettings };
    pendingWorkspaceBackground = getWorkspaceBackgroundFilename(appSettings);
    applyGlassSettings(settingsDraft);
    previewWorkspaceBackground(pendingWorkspaceBackground).catch((error) => {
        console.error('Failed to preview workspace background:', error);
    });
    setSettingsDirty(false);
}

async function closeSettingsPanel({ revert = true } = {}) {
    settingsOverlay.classList.remove('active');
    stopRecording();
    if (revert) {
        await hydrateSettings(appSettings);
    }
    settingsDraft = null;
    pendingWorkspaceBackground = '';
    setSettingsDirty(false);
}

async function saveSettingsChanges() {
    if (!settingsDraft) return;
    if (!settingsDirty) {
        await closeSettingsPanel({ revert: false });
        return;
    }

    settingsSaveBtn.disabled = true;
    settingsCancelBtn.disabled = true;
    settingsSaveState.textContent = 'Saving appearance...';

    try {
        const payload = {
            glassMode: 'apple',
            surfaceOpacity: settingsDraft.surface_opacity,
            surfaceBrightness: settingsDraft.surface_brightness,
            cardOpacity: settingsDraft.card_opacity,
            glassBlur: settingsDraft.glass_blur,
            backgroundVisibility: settingsDraft.background_visibility,
            accentColor: settingsDraft.accent_color,
            backgroundFilename: pendingWorkspaceBackground,
            fitCardsToWindow: !!settingsDraft.fit_cards_to_window,
        };

        let settings = await invoke('set_appearance_settings', payload);
        if (!settings) {
            settings = await invoke('get_settings');
        }

        await hydrateSettings(settings);
        await closeSettingsPanel({ revert: false });
        showToast('Appearance saved!');
    } catch (error) {
        console.error('Failed to save settings:', error);
        const errorText = String(error || 'Unknown error').replace(/^Error:\s*/, '');
        settingsSaveState.textContent = `Save failed: ${errorText}`;
        settingsCancelBtn.disabled = false;
        settingsSaveBtn.disabled = false;
    }
}

$('#settingsBtn').addEventListener('click', async () => {
    await hydrateSettings(await invoke('get_settings'));
    startSettingsDraft();
    settingsOverlay.classList.add('active');
});

$('#settingsClose').addEventListener('click', async () => {
    await closeSettingsPanel();
});

settingsCancelBtn?.addEventListener('click', async () => {
    await closeSettingsPanel();
});

settingsSaveBtn?.addEventListener('click', async () => {
    await saveSettingsChanges();
});

settingsOverlay.addEventListener('click', async (e) => {
    if (e.target === settingsOverlay) {
        await closeSettingsPanel();
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
        appSettings.shortcut = recordedShortcut;
        showToast('Shortcut updated!');
    } catch (e) {
        showToast('Invalid shortcut: ' + e);
    }
    stopRecording();
});

async function pickWorkspaceBackground() {
    const result = await invoke('select_images');
    const image = Array.isArray(result) ? result[0] : null;
    if (!image || !image.filename) return;

    if (!settingsDraft) settingsDraft = { ...appSettings };
    pendingWorkspaceBackground = image.filename;
    settingsDraft = {
        ...settingsDraft,
        main_background: image.filename,
        sidebar_background: image.filename,
    };
    await previewWorkspaceBackground(image.filename);
    setSettingsDirty(true);
}

async function clearWorkspaceBackground() {
    if (!settingsDraft) settingsDraft = { ...appSettings };
    pendingWorkspaceBackground = '';
    settingsDraft = {
        ...settingsDraft,
        main_background: '',
        sidebar_background: '',
    };
    await previewWorkspaceBackground('');
    setSettingsDirty(true);
}

workspaceBgUploadBtn?.addEventListener('click', () => pickWorkspaceBackground());
workspaceBgClearBtn?.addEventListener('click', () => clearWorkspaceBackground());

function previewGlassSettings() {
    if (!settingsDraft) settingsDraft = { ...appSettings };
    const payload = collectGlassSettingsFromControls();
    settingsDraft = {
        ...settingsDraft,
        ...payload,
    };
    settingsDraft = applyGlassSettings(settingsDraft);
    setSettingsDirty(true);
}

[surfaceGlassSlider, surfaceBrightnessSlider, bgVisibilitySlider].forEach((slider) => {
    slider?.addEventListener('input', previewGlassSettings);
});

accentColorPicker?.addEventListener('input', previewGlassSettings);

fitCardsToWindowCheckbox?.addEventListener('change', () => {
    if (!settingsDraft) settingsDraft = { ...appSettings };
    settingsDraft.fit_cards_to_window = fitCardsToWindowCheckbox.checked;
    applyCardLayoutSetting(settingsDraft);
    setSettingsDirty(true);
});

function stopRecording() {
    isRecording = false;
    shortcutRecorder.style.display = 'none';
    recordedShortcut = '';
}

// ─── Motion Enhancements ───────────────────────────────────────
const rippleSelector = [
    '.btn-primary',
    '.btn-secondary',
    '.btn-icon',
    '.folder-item',
    '.prompt-card',
    '.card-btn',
    '.card-copy-main',
    '.sort-option',
    '.segmented-option',
    '.settings-close',
    '.shortcut-record-btn',
    '.settings-media-btn',
    '.image-upload-btn',
    '.theme-toggle',
    '.win-btn',
].join(', ');

function createRipple(target, clientX, clientY) {
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.8;
    const ripple = document.createElement('span');
    ripple.className = 'ui-ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${clientX - rect.left - size / 2}px`;
    ripple.style.top = `${clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

function createAmbientPulse(clientX, clientY) {
    const pulse = document.createElement('span');
    pulse.className = 'ui-ambient-pulse';
    pulse.style.left = `${clientX}px`;
    pulse.style.top = `${clientY}px`;
    document.body.appendChild(pulse);
    pulse.addEventListener('animationend', () => pulse.remove(), { once: true });
}

document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = e.target.closest(rippleSelector);
    if (target) {
        createRipple(target, e.clientX, e.clientY);
        return;
    }

    if (e.target.closest('input, textarea, select, option, [contenteditable="true"]')) return;
    createAmbientPulse(e.clientX, e.clientY);
});

// ─── Theme Transition ──────────────────────────────────────────
let isThemeTransitioning = false;

function getThemeRevealMetrics(triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const maxX = Math.max(originX, window.innerWidth - originX);
    const maxY = Math.max(originY, window.innerHeight - originY);
    const radius = Math.hypot(maxX, maxY);
    return { originX, originY, radius };
}

function applyThemeState(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    appSettings.theme = theme;
    applyAccentColor(settingsDraft || appSettings);
}

async function toggleThemeWithReveal(triggerEl) {
    if (isThemeTransitioning) return;

    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    const { originX, originY, radius } = getThemeRevealMetrics(triggerEl);

    html.style.setProperty('--theme-reveal-x', `${originX}px`);
    html.style.setProperty('--theme-reveal-y', `${originY}px`);
    html.style.setProperty('--theme-reveal-radius', `${radius}px`);

    isThemeTransitioning = true;
    triggerEl.classList.add('is-busy');

    try {
        if (typeof document.startViewTransition === 'function') {
            const transition = document.startViewTransition(() => {
                applyThemeState(next);
            });

            await transition.ready;
            html.classList.add('theme-view-transition-active');

            const reveal = document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${originX}px ${originY}px)`,
                        `circle(${radius}px at ${originX}px ${originY}px)`,
                    ],
                },
                {
                    duration: 620,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    pseudoElement: '::view-transition-new(root)',
                }
            );

            await Promise.allSettled([transition.finished, reveal.finished]);
            html.classList.remove('theme-view-transition-active');
        } else if (themeTransitionLayer) {
            themeTransitionLayer.style.setProperty('--theme-reveal-x', `${originX}px`);
            themeTransitionLayer.style.setProperty('--theme-reveal-y', `${originY}px`);
            themeTransitionLayer.className = `theme-transition-layer to-${next}`;
            void themeTransitionLayer.offsetWidth;
            themeTransitionLayer.classList.add('is-prepared');
            applyThemeState(next);
            requestAnimationFrame(() => themeTransitionLayer.classList.add('is-expanding'));
            await new Promise(resolve => setTimeout(resolve, 620));
            themeTransitionLayer.className = 'theme-transition-layer';
        } else {
            applyThemeState(next);
        }

        await invoke('set_theme', { theme: next });
    } catch (error) {
        console.error('Failed to persist theme:', error);
        applyThemeState(next);
    } finally {
        html.classList.remove('theme-view-transition-active');
        if (themeTransitionLayer) {
            themeTransitionLayer.className = 'theme-transition-layer';
        }
        triggerEl.classList.remove('is-busy');
        isThemeTransitioning = false;
    }
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
        setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
    }
});

// ─── Init ──────────────────────────────────────────────────────
async function init() {
    folders = await invoke('get_folders');
    await hydrateSettings(await invoke('get_settings'));

    if (folders.length > 0) {
        activeFolderId = folders[0].id;
    }

    renderFolders();
    renderPrompts();
    setSidebarCollapsed(sidebar.classList.contains('collapsed'));
    requestAnimationFrame(() => {
        document.body.classList.remove('app-booting');
        document.body.classList.add('app-ready');
    });

    // Listen for data changes from Quick Save window
    if (window.__TAURI__ && window.__TAURI__.event) {
        window.__TAURI__.event.listen('folders-changed', async () => {
            folders = await invoke('get_folders');
            renderFolders();
            renderPrompts();
        });
    }
}

init();
