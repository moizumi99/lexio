import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openPdf: () => ipcRenderer.invoke('dialog:open-pdf'),
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  saveFile: (name: string, content: string) => ipcRenderer.invoke('dialog:save-file', name, content),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: object) => ipcRenderer.invoke('settings:save', settings),

  // Menu events from main process
  onPdfOpened: (cb: (data: { path: string; name: string; data: string }) => void) => {
    ipcRenderer.on('pdf:opened', (_e, data) => cb(data));
  },
  onToggleSidebar: (cb: () => void) => {
    ipcRenderer.on('menu:toggle-sidebar', () => cb());
  },
  onZoomIn: (cb: () => void) => {
    ipcRenderer.on('menu:zoom-in', () => cb());
  },
  onZoomOut: (cb: () => void) => {
    ipcRenderer.on('menu:zoom-out', () => cb());
  },
  onZoomReset: (cb: () => void) => {
    ipcRenderer.on('menu:zoom-reset', () => cb());
  },
  onExportAnnotations: (cb: () => void) => {
    ipcRenderer.on('menu:export-annotations', () => cb());
  },
});
