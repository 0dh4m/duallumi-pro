const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,

  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleMiniHUD: () => ipcRenderer.send('window-toggle-mini-hud'),

  // Query Window State
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Native Notifications
  notify: (title, body) => ipcRenderer.send('show-notification', { title, body }),

  // Ambilight Desktop Screen Capture (Zero-Prompt 60FPS)
  getScreenSources: async () => {
    return await ipcRenderer.invoke('get-screen-sources');
  },

  // Native Direct API Bridge (Immune to CORS / file:// limitations)
  post: (endpoint, body) => ipcRenderer.invoke('api-post', { endpoint, body }),
  getStatus: () => ipcRenderer.invoke('api-get-status'),

  // State synchronization
  onHotkeyPressed: (callback) => {
    ipcRenderer.on('hotkey-triggered', (event, data) => callback(data));
  }
});

// Notify DOM that we are in desktop application mode
window.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('is-desktop-app');
});

