/**
 * Copyright (C) 2026 Adham Cherkaoui Eddeqaqi (0dh4m). All rights reserved.
 * Proprietary and confidential. Unauthorized copying or distribution is strictly prohibited.
 * Author: Adham Cherkaoui Eddeqaqi (0dh4m) <0dh4mm@gmail.com>
 * GitHub: https://github.com/0dh4m
 */

const { globalShortcut } = require('electron');

class HotkeyManager {
  constructor(backendManager, notifyCallback) {
    this.backend = backendManager;
    this.notify = notifyCallback || (() => {});
  }

  registerAll() {
    // 1. Master Power: Ctrl + Shift + L
    this.tryRegister('CommandOrControl+Shift+L', async () => {
      const newState = await this.backend.toggleMasterPower();
      this.notify('Master Power', newState ? 'Lights Turned ON 🟢' : 'Lights Turned OFF ⚪');
    });

    // 2. Brightness Up (+10%): Ctrl + Shift + Up
    this.tryRegister('CommandOrControl+Shift+Up', async () => {
      const status = await this.backend.getStatus();
      const current = status?.strip?.brightness || 50;
      const target = Math.min(100, current + 10);
      await this.backend.setMasterBrightness(target);
      this.notify('Brightness', `Increased to ${target}% ☀️`);
    });

    // 3. Brightness Down (-10%): Ctrl + Shift + Down
    this.tryRegister('CommandOrControl+Shift+Down', async () => {
      const status = await this.backend.getStatus();
      const current = status?.strip?.brightness || 50;
      const target = Math.max(5, current - 10);
      await this.backend.setMasterBrightness(target);
      this.notify('Brightness', `Decreased to ${target}% 🌙`);
    });

    // 4. Toggle Sync: Ctrl + Shift + S
    this.tryRegister('CommandOrControl+Shift+S', async () => {
      const isSync = await this.backend.toggleSyncMode();
      this.notify('Sync Mode', isSync ? 'Unified Sync: ENABLED ⚡' : 'Independent Mode 🎛️');
    });

    // 5. Presets: Ctrl + Shift + 1 .. 5
    this.tryRegister('CommandOrControl+Shift+1', async () => {
      await this.backend.setPresetScene('sunset');
      this.notify('Scene Activated', '🌆 Sunset Glow');
    });

    this.tryRegister('CommandOrControl+Shift+2', async () => {
      await this.backend.setPresetScene('cyberpunk');
      this.notify('Scene Activated', '⚡ Cyberpunk Neon');
    });

    this.tryRegister('CommandOrControl+Shift+3', async () => {
      await this.backend.setPresetScene('ocean');
      this.notify('Scene Activated', '🌊 Deep Ocean');
    });

    this.tryRegister('CommandOrControl+Shift+4', async () => {
      await this.backend.setPresetScene('candle');
      this.notify('Scene Activated', '🕯️ Cozy Candlelight');
    });

    this.tryRegister('CommandOrControl+Shift+5', async () => {
      await this.backend.setPresetScene('daylight');
      this.notify('Scene Activated', '☀️ Focus Daylight');
    });

    console.log('✅ Global Desktop Hotkeys Registered (Ctrl+Shift+L, Up, Down, S, 1..5)');
  }

  tryRegister(accelerator, handler) {
    try {
      const success = globalShortcut.register(accelerator, handler);
      if (!success) {
        console.warn(`Could not register global hotkey: ${accelerator}`);
      }
    } catch (e) {
      console.warn(`Error registering ${accelerator}:`, e);
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }
}

module.exports = HotkeyManager;

