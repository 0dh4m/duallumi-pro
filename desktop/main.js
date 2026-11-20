const { app, BrowserWindow, ipcMain, screen, Notification, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL UNHANDLED REJECTION:', reason);
});

const BackendManager = require('./backend_manager');
const TrayManager = require('./tray');
const HotkeyManager = require('./hotkeys');

let mainWindow = null;
let miniHudWindow = null;
let backend = null;
let tray = null;
let hotkeys = null;

const STATE_FILE = path.join(__dirname, 'window_state.json');
const ICON_PATH = path.join(__dirname, '..', 'web', 'icons', 'icon-512.png');

// Load or default window state
function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { width: 1280, height: 860, isMaximized: false };
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const isMax = mainWindow.isMaximized();
    const bounds = mainWindow.getBounds();
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: isMax
    }));
  } catch (e) {}
}

async function createMainWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width || 1280,
    height: state.height || 860,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0E121B',
    title: 'DualLumi PRO',
    icon: ICON_PATH,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  // Load Dedicated Native Desktop Cyberpunk UI (Zero WebView feel, Zero web scrollbars)
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // Minimize to Tray instead of quitting on close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      saveWindowState();
      mainWindow.hide();

      if (Notification.isSupported()) {
        new Notification({
          title: 'DualLumi PRO',
          body: 'Application running in system tray. Lighting schedules and hotkeys remain active.',
          icon: ICON_PATH
        }).show();
      }
    }
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
}

// Create Mini Floating HUD
function createMiniHudWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  miniHudWindow = new BrowserWindow({
    width: 310,
    height: 150,
    x: width - 330,
    y: height - 170,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  miniHudWindow.loadFile(path.join(__dirname, 'mini_hud.html'));

  miniHudWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      miniHudWindow.hide();
    }
  });
}

function toggleMiniHud() {
  if (!miniHudWindow) {
    createMiniHudWindow();
  }
  if (miniHudWindow.isVisible()) {
    miniHudWindow.hide();
  } else {
    // Sync current status to mini HUD
    backend.getStatus().then(status => {
      miniHudWindow.webContents.send('sync-state', status);
    });
    miniHudWindow.show();
  }
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
app.whenReady().then(async () => {
  backend = new BackendManager(8080);

  // 1. Ensure Python Backend is active
  const rootDir = path.join(__dirname, '..');
  await backend.ensureRunning(rootDir);

  // 2. Create Window and Mini HUD
  await createMainWindow();
  createMiniHudWindow();

  // 3. System Tray
  tray = new TrayManager(mainWindow, backend, ICON_PATH);

  // 4. Global Hotkeys
  hotkeys = new HotkeyManager(backend, (title, msg) => {
    if (Notification.isSupported()) {
      new Notification({ title: `DualLumi: ${title}`, body: msg, icon: ICON_PATH, silent: true }).show();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey-triggered', { title, message: msg });
    }
    tray.updateContextMenu();
  });
  hotkeys.registerAll();

  // If launched with --hidden (e.g. Windows startup), hide main window
  if (process.argv.includes('--hidden')) {
    mainWindow.hide();
  }
});

app.on('will-quit', () => {
  if (hotkeys) hotkeys.unregisterAll();
  if (tray) tray.destroy();
});

app.on('window-all-closed', () => {
  // Keep app active in system tray unless explicitly quitting
  if (app.isQuitting) {
    app.quit();
  }
});

// -------------------------------------------------------------
// IPC Handlers
// -------------------------------------------------------------
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) mainWindow.maximize();
});

ipcMain.on('window-toggle-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window-toggle-mini-hud', () => {
  toggleMiniHud();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: ICON_PATH }).show();
  }
});

// Zero-Prompt Desktop Ambilight screen capture source query
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 }
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  } catch (err) {
    console.error('desktopCapturer error:', err);
    return [];
  }
});

// Native REST API Bridge via BackendManager (Immune to CORS / Protocol restrictions)
ipcMain.handle('api-post', async (event, { endpoint, body }) => {
  return await backend.sendCommand(endpoint, body);
});

ipcMain.handle('api-get-status', async () => {
  return await backend.getStatus();
});

// Mini HUD action dispatcher
ipcMain.on('mini-action', async (event, data) => {
  switch (data.action) {
    case 'power':
      await backend.sendCommand('power', { target: 'all', power: data.state });
      break;
    case 'brightness':
      await backend.sendCommand('brightness', { target: 'all', brightness: parseInt(data.value, 10) });
      break;
    case 'scene':
      await backend.setPresetScene(data.scene);
      break;
    case 'expand':
      if (miniHudWindow) miniHudWindow.hide();
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
      break;
    case 'hide':
      if (miniHudWindow) miniHudWindow.hide();
      break;
  }
  tray.updateContextMenu();
});

