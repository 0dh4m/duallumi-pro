/**
 * Copyright (C) 2026 Adham Cherkaoui Eddeqaqi (0dh4m). All rights reserved.
 * Proprietary and confidential. Unauthorized copying or distribution is strictly prohibited.
 * Author: Adham Cherkaoui Eddeqaqi (0dh4m) <adamcherkaoui99@gmail.com>
 * GitHub: https://github.com/0dh4m
 */

const http = require('http');
const { spawn, exec } = require('child_process');
const path = require('path');

class BackendManager {
  constructor(port = 8080) {
    this.port = port;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.isServerReady = false;
    this.backendProcess = null;
    this.statusCache = null;
  }

  // Ping /api/status to verify if aiohttp server is up
  async checkHealth() {
    return new Promise((resolve) => {
      const req = http.get(`${this.baseUrl}/api/status`, { timeout: 1500 }, (res) => {
        if (res.statusCode === 200) {
          let rawData = '';
          res.on('data', chunk => rawData += chunk);
          res.on('end', () => {
            try {
              this.statusCache = JSON.parse(rawData);
              this.isServerReady = true;
              resolve(true);
            } catch (e) {
              resolve(false);
            }
          });
        } else {
          resolve(false);
        }
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  // Auto-launch Python backend in the background silently
  async ensureRunning(rootDir) {
    const isUp = await this.checkHealth();
    if (isUp) {
      console.log('✅ DualLumi Python backend is already running on port', this.port);
      return true;
    }

    console.log('🚀 Spawning DualLumi Python server in background...');
    const serverScript = path.join(rootDir, 'backend', 'server.py');

    try {
      // Spawn pythonw (silent GUI python without console window)
      this.backendProcess = spawn('pythonw', [serverScript], {
        cwd: rootDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      this.backendProcess.unref();

      // Poll up to 12 seconds for the server to spin up
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 500));
        const ready = await this.checkHealth();
        if (ready) {
          console.log('✅ DualLumi Python backend is now ready!');
          return true;
        }
      }
    } catch (err) {
      console.error('Failed to spawn pythonw:', err);
    }

    return false;
  }

  // Send REST command to backend (used by Tray & Global Hotkeys)
  async sendCommand(endpoint, body = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request(`${this.baseUrl}/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 2000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', (err) => resolve({ error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'timeout' });
      });

      req.write(postData);
      req.end();
    });
  }

  // Query live status
  async getStatus() {
    await this.checkHealth();
    return this.statusCache;
  }

  // Quick Action Helpers
  async toggleMasterPower() {
    const status = await this.getStatus();
    const isAnyOn = (status?.strip?.power || status?.bulb?.power);
    const targetState = !isAnyOn;

    await this.sendCommand('power', { target: 'all', power: targetState });
    return targetState;
  }

  async setMasterBrightness(level) {
    const clamped = Math.max(1, Math.min(100, Math.round(level)));
    await this.sendCommand('brightness', { target: 'all', brightness: clamped });
    return clamped;
  }

  async setMasterColor(r, g, b) {
    await this.sendCommand('color', { target: 'all', r, g, b });
  }

  async setPresetScene(sceneName) {
    const presets = {
      sunset: { r: 255, g: 90, b: 20, brightness: 80 },
      cyberpunk: { r: 0, g: 243, b: 255, brightness: 90 },
      ocean: { r: 0, g: 140, b: 255, brightness: 75 },
      candle: { r: 255, g: 147, b: 41, brightness: 40 },
      daylight: { r: 255, g: 255, b: 255, brightness: 100 },
      red_stealth: { r: 255, g: 10, b: 10, brightness: 50 }
    };

    const scene = presets[sceneName];
    if (scene) {
      await this.sendCommand('color', { target: 'all', r: scene.r, g: scene.g, b: scene.b });
      if (scene.brightness) {
        await this.sendCommand('brightness', { target: 'all', brightness: scene.brightness });
      }
    }
  }

  async toggleSyncMode() {
    const status = await this.getStatus();
    const newSync = !status?.sync_mode;
    await this.sendCommand('sync_mode', { sync_mode: newSync });
    return newSync;
  }
}

module.exports = BackendManager;

