const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Folders
    getFolders: () => ipcRenderer.invoke('get-folders'),
    createFolder: (name) => ipcRenderer.invoke('create-folder', name),
    renameFolder: (id, name) => ipcRenderer.invoke('rename-folder', { id, name }),
    deleteFolder: (id) => ipcRenderer.invoke('delete-folder', id),

    // Prompts
    createPrompt: (folderId, name, text, tags, images) =>
        ipcRenderer.invoke('create-prompt', { folderId, name, text, tags, images }),
    updatePrompt: (folderId, promptId, name, text, tags, images) =>
        ipcRenderer.invoke('update-prompt', { folderId, promptId, name, text, tags, images }),
    deletePrompt: (folderId, promptId) =>
        ipcRenderer.invoke('delete-prompt', { folderId, promptId }),
    movePrompt: (fromFolderId, toFolderId, promptId) =>
        ipcRenderer.invoke('move-prompt', { fromFolderId, toFolderId, promptId }),

    // Images
    selectImages: () => ipcRenderer.invoke('select-images'),
    saveImage: (dataUrl) => ipcRenderer.invoke('save-image', { dataUrl }),
    getImagePath: (filename) => ipcRenderer.invoke('get-image-path', filename),
    readClipboardImage: () => ipcRenderer.invoke('read-clipboard-image'),

    // Clipboard
    copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

    // Theme
    getTheme: () => ipcRenderer.invoke('get-theme'),
    setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),

    // Window
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close')
});
