const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

class TrayManager {
  constructor(mainWindow, backendManager, appIconPath) {
    this.mainWindow = mainWindow;
    this.backend = backendManager;
    this.appIconPath = appIconPath;
    this.tray = null;

    this.initTray();
  }

  initTray() {
    try {
      let icon = nativeImage.createFromPath(this.appIconPath);
      if (!icon.isEmpty()) {
        this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
        this.tray.setToolTip('DualLumi PRO - Master Smart Lighting');
        this.updateContextMenu();

        // Left click toggles window
        this.tray.on('click', () => {
          this.toggleWindow();
        });
      }
    } catch (e) {
      console.warn('Tray init warning:', e);
    }
  }

  toggleWindow() {
    if (!this.mainWindow) return;
    if (this.mainWindow.isVisible()) {
      if (this.mainWindow.isFocused()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  async updateContextMenu() {
    if (!this.tray) return;
    const status = await this.backend.getStatus();
    const isStripOn = status?.strip?.power || false;
    const isBulbOn = status?.bulb?.power || false;
    const isSync = status?.sync_mode || false;
    const isAnyOn = isStripOn || isBulbOn;

    // Dynamic Tooltip
    this.tray.setToolTip(
      `DualLumi PRO\n` +
      `Strip: ${isStripOn ? 'ON 🟢' : 'OFF ⚪'} | Bulb: ${isBulbOn ? 'ON 🟢' : 'OFF ⚪'}\n` +
      `Sync Mode: ${isSync ? 'ENABLED ⚡' : 'INDEPENDENT 🎛️'}`
    );

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'DualLumi PRO v3.5',
        enabled: false,
        icon: nativeImage.createFromPath(this.appIconPath).resize({ width: 14, height: 14 })
      },
      { type: 'separator' },
      {
        label: isAnyOn ? '🔴 Turn All OFF' : '🟢 Turn All ON',
        click: async () => {
          await this.backend.toggleMasterPower();
          this.updateContextMenu();
        }
      },
      {
        label: `⚡ Sync Mode (${isSync ? 'ON' : 'OFF'})`,
        type: 'checkbox',
        checked: isSync,
        click: async () => {
          await this.backend.toggleSyncMode();
          this.updateContextMenu();
        }
      },
      { type: 'separator' },
      {
        label: '🎛️ Quick Devices',
        submenu: [
          {
            label: `ELK Strip: ${isStripOn ? 'Turn OFF' : 'Turn ON'}`,
            click: async () => {
              await this.backend.sendCommand('power', { target: 'strip', state: !isStripOn });
              this.updateContextMenu();
            }
          },
          {
            label: `KS04 Bulb: ${isBulbOn ? 'Turn OFF' : 'Turn ON'}`,
            click: async () => {
              await this.backend.sendCommand('power', { target: 'bulb', state: !isBulbOn });
              this.updateContextMenu();
            }
          }
        ]
      },
      {
        label: '☀️ Brightness',
        submenu: [
          { label: '100% (Maximum)', click: () => this.backend.setMasterBrightness(100) },
          { label: '75% (Bright)', click: () => this.backend.setMasterBrightness(75) },
          { label: '50% (Comfortable)', click: () => this.backend.setMasterBrightness(50) },
          { label: '25% (Cozy Night)', click: () => this.backend.setMasterBrightness(25) },
          { label: '5% (Minimum Glow)', click: () => this.backend.setMasterBrightness(5) }
        ]
      },
      {
        label: '🎨 Preset Scenes',
        submenu: [
          { label: '🌆 Sunset Glow', click: () => this.backend.setPresetScene('sunset') },
          { label: '⚡ Cyberpunk Neon', click: () => this.backend.setPresetScene('cyberpunk') },
          { label: '🌊 Deep Ocean', click: () => this.backend.setPresetScene('ocean') },
          { label: '🕯️ Cozy Candlelight (2200K)', click: () => this.backend.setPresetScene('candle') },
          { label: '☀️ Focus Daylight (5500K)', click: () => this.backend.setPresetScene('daylight') },
          { label: '🩸 Night Stealth Red', click: () => this.backend.setPresetScene('red_stealth') }
        ]
      },
      { type: 'separator' },
      {
        label: '🗖 Open Dashboard',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      },
      {
        label: '⚙️ Start With Windows',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
            path: process.execPath,
            args: ['--hidden']
          });
        }
      },
      { type: 'separator' },
      {
        label: '❌ Quit DualLumi Completely',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;

