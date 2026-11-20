// DualLumi PRO Desktop - Core Application Controller

class DualLumiDesktopApp {
  constructor() {
    this.apiBase = 'http://127.0.0.1:8080';
    this.syncMode = true;

    this.state = {
      strip: { power: true, r: 255, g: 85, b: 0, brightness: 100, connected: true },
      bulb: { power: true, r: 0, g: 240, b: 255, brightness: 100, connected: true },
      sync_mode: true
    };

    this.initElements();
    this.initVisualizer();
    this.initColorWheel();
    this.initEvents();
    this.initWebSocket();
    this.fetchInitialStatus();

    // Auto-poll status every 2 seconds
    setInterval(() => this.fetchInitialStatus(), 2000);
  }

  initElements() {
    // Window Buttons
    document.getElementById('win-min')?.addEventListener('click', () => window.desktopAPI?.minimize());
    document.getElementById('win-max')?.addEventListener('click', () => window.desktopAPI?.toggleMaximize());
    document.getElementById('win-close')?.addEventListener('click', () => window.desktopAPI?.close());
    document.getElementById('win-mini')?.addEventListener('click', () => window.desktopAPI?.toggleMiniHUD());

    // Status Dots
    this.dotBt = document.getElementById('dot-bt');
    this.dotStrip = document.getElementById('dot-strip');
    this.dotBulb = document.getElementById('dot-bulb');

    // Master Controls
    this.switchMaster = document.getElementById('switch-master');
    this.btnSyncMode = document.getElementById('btn-mode-sync');
    this.btnIndepMode = document.getElementById('btn-mode-indep');
    this.sliderMasterBri = document.getElementById('slider-master-bri');
    this.lblMasterBri = document.getElementById('lbl-master-bri');

    // Strip Controls
    this.switchStrip = document.getElementById('switch-strip');
    this.sliderStripBri = document.getElementById('slider-strip-bri');
    this.lblStripBri = document.getElementById('lbl-strip-bri');
    this.swatchStrip = document.getElementById('swatch-strip');

    // Bulb Controls
    this.switchBulb = document.getElementById('switch-bulb');
    this.sliderBulbBri = document.getElementById('slider-bulb-bri');
    this.lblBulbBri = document.getElementById('lbl-bulb-bri');
    this.swatchBulb = document.getElementById('swatch-bulb');

    // Studio Elements
    this.hexInput = document.getElementById('input-hex');
    this.sliderKelvin = document.getElementById('slider-kelvin');
    this.lblKelvin = document.getElementById('lbl-kelvin');
    this.glow1 = document.getElementById('glow-1');
    this.glow2 = document.getElementById('glow-2');
  }

  initVisualizer() {
    const canvas = document.getElementById('room-canvas');
    if (canvas) {
      this.visualizer = new RoomVisualizer(canvas);
    }
  }

  initColorWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (canvas) {
      this.wheel = new DualLumiColorWheel(canvas, (r, g, b) => {
        this.onColorPicked(r, g, b);
      });
    }
  }

  initEvents() {
    // Master Power Toggle
    this.switchMaster.addEventListener('change', () => {
      const pwr = this.switchMaster.checked;
      window.cyberAudio?.playPower(pwr);
      this.post('power', { target: 'all', power: pwr });

      this.switchStrip.checked = pwr;
      this.switchBulb.checked = pwr;
      this.state.strip.power = pwr;
      this.state.bulb.power = pwr;
      this.visualizer?.update(this.state.strip, this.state.bulb);
    });

    // Master Brightness
    this.sliderMasterBri.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.lblMasterBri.textContent = `${val}%`;
      this.post('brightness', { target: 'all', brightness: val });

      this.sliderStripBri.value = val;
      this.lblStripBri.textContent = `${val}%`;
      this.sliderBulbBri.value = val;
      this.lblBulbBri.textContent = `${val}%`;
      this.state.strip.brightness = val;
      this.state.bulb.brightness = val;
      this.visualizer?.update(this.state.strip, this.state.bulb);
    });

    // Mode Toggle
    this.btnSyncMode.addEventListener('click', () => {
      window.cyberAudio?.playClick();
      this.setSyncMode(true);
    });

    this.btnIndepMode.addEventListener('click', () => {
      window.cyberAudio?.playClick();
      this.setSyncMode(false);
    });

    // Individual Strip Controls
    this.switchStrip.addEventListener('change', () => {
      window.cyberAudio?.playClick();
      const pwr = this.switchStrip.checked;
      this.post('power', { target: 'strip', power: pwr });
      this.state.strip.power = pwr;
      this.visualizer?.update(this.state.strip, this.state.bulb);
    });

    this.sliderStripBri.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.lblStripBri.textContent = `${val}%`;
      this.post('brightness', { target: 'strip', brightness: val });
      this.state.strip.brightness = val;
      this.visualizer?.update(this.state.strip, this.state.bulb);
    });

    // Individual Bulb Controls
    this.switchBulb.addEventListener('change', () => {
      window.cyberAudio?.playClick();
      const pwr = this.switchBulb.checked;
      this.post('power', { target: 'bulb', power: pwr });
      this.state.bulb.power = pwr;
      this.visualizer?.update(this.state.strip, this.state.bulb);
    });

    this.sliderBulbBri.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.lblBulbBri.textContent = `${val}%`;
      this.post('brightness', { target: 'bulb', brightness: val });
      this.state.bulb.brightness = val;
      this.visualizer?.update(this.state.strip, this.state.bulb);
    });

    // Kelvin White Slider
    this.sliderKelvin.addEventListener('input', (e) => {
      const k = parseInt(e.target.value, 10);
      this.lblKelvin.textContent = `${k}K`;
      const tgt = this.syncMode ? 'all' : 'bulb';
      this.post('color_temp', { target: tgt, kelvin: k });
    });

    // Preset Scenes
    document.querySelectorAll('.scene-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.cyberAudio?.playScene();
        const r = parseInt(btn.dataset.r, 10);
        const g = parseInt(btn.dataset.g, 10);
        const b = parseInt(btn.dataset.b, 10);
        const bri = parseInt(btn.dataset.bri, 10) || 100;

        this.sliderMasterBri.value = bri;
        this.lblMasterBri.textContent = `${bri}%`;
        this.sliderStripBri.value = bri;
        this.lblStripBri.textContent = `${bri}%`;
        this.sliderBulbBri.value = bri;
        this.lblBulbBri.textContent = `${bri}%`;

        this.wheel?.setColor(r, g, b);
        this.onColorPicked(r, g, b);
        this.post('brightness', { target: 'all', brightness: bri });
      });
    });

    // Dynamic Hardware Effects
    document.querySelectorAll('.fx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.cyberAudio?.playClick();
        const fxId = parseInt(btn.dataset.fx, 10);
        this.post('effect', { effect: fxId, target: 'all', speed: 50 });
      });
    });

    // Reconnect pills on click
    this.dotStrip?.parentElement?.addEventListener('click', () => {
      this.post('connect', { device: 'strip' });
    });
    this.dotBulb?.parentElement?.addEventListener('click', () => {
      this.post('connect', { device: 'bulb' });
    });

    // Hex input
    this.hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const hex = this.hexInput.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          this.wheel?.setColor(r, g, b);
          this.onColorPicked(r, g, b);
        }
      }
    });
  }

  setSyncMode(sync) {
    this.syncMode = sync;
    if (sync) {
      this.btnSyncMode.classList.add('active');
      this.btnIndepMode.classList.remove('active');
    } else {
      this.btnIndepMode.classList.add('active');
      this.btnSyncMode.classList.remove('active');
    }
    this.post('sync_mode', { sync_mode: sync });
  }

  onColorPicked(r, g, b) {
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    this.hexInput.value = hex;

    // Shift dynamic ambient background glow
    if (this.glow1) {
      this.glow1.style.background = `radial-gradient(circle, rgb(${r}, ${g}, ${b}), transparent 70%)`;
    }

    const target = this.syncMode ? 'all' : 'strip';
    this.post('color', { target, r, g, b });

    // Update virtual room visualizer
    if (this.syncMode) {
      this.state.strip.r = r; this.state.strip.g = g; this.state.strip.b = b;
      this.state.bulb.r = r; this.state.bulb.g = g; this.state.bulb.b = b;
      this.swatchStrip.style.background = `rgb(${r}, ${g}, ${b})`;
      this.swatchBulb.style.background = `rgb(${r}, ${g}, ${b})`;
    } else {
      this.state.strip.r = r; this.state.strip.g = g; this.state.strip.b = b;
      this.swatchStrip.style.background = `rgb(${r}, ${g}, ${b})`;
    }
    this.visualizer?.update(this.state.strip, this.state.bulb);
  }

  async fetchInitialStatus() {
    try {
      let data = null;
      if (window.desktopAPI && window.desktopAPI.getStatus) {
        data = await window.desktopAPI.getStatus();
      }
      if (!data) {
        const res = await fetch(`${this.apiBase}/api/status`);
        if (res.ok) data = await res.json();
      }
      if (data) {
        this.updateFromState(data);
      }
    } catch (e) {
      console.warn('Could not fetch status:', e);
    }
  }

  initWebSocket() {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:8080/ws`);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'status_update' && msg.data) {
            this.updateFromState(msg.data);
          }
        } catch (err) {}
      };
      ws.onerror = () => setTimeout(() => this.initWebSocket(), 3000);
      ws.onclose = () => setTimeout(() => this.initWebSocket(), 3000);
    } catch (e) {}
  }

  updateFromState(data) {
    if (!data) return;
    this.state = data;

    // Connection Dots
    if (data.bluetooth_radio === 'on') {
      this.dotBt.classList.remove('offline');
    } else {
      this.dotBt.classList.add('offline');
    }

    if (data.strip && data.strip.connected) {
      this.dotStrip.classList.remove('offline');
    } else {
      this.dotStrip.classList.add('offline');
    }

    if (data.bulb && data.bulb.connected) {
      this.dotBulb.classList.remove('offline');
    } else {
      this.dotBulb.classList.add('offline');
    }

    // Power
    const isAnyOn = (data.strip?.power || data.bulb?.power);
    this.switchMaster.checked = isAnyOn;
    this.switchStrip.checked = data.strip?.power ?? false;
    this.switchBulb.checked = data.bulb?.power ?? false;

    // Brightness
    if (data.strip?.brightness) {
      this.sliderStripBri.value = data.strip.brightness;
      this.lblStripBri.textContent = `${data.strip.brightness}%`;
    }
    if (data.bulb?.brightness) {
      this.sliderBulbBri.value = data.bulb.brightness;
      this.lblBulbBri.textContent = `${data.bulb.brightness}%`;
    }

    // Swatches
    if (data.strip) {
      this.swatchStrip.style.background = `rgb(${data.strip.r}, ${data.strip.g}, ${data.strip.b})`;
    }
    if (data.bulb) {
      this.swatchBulb.style.background = `rgb(${data.bulb.r}, ${data.bulb.g}, ${data.bulb.b})`;
    }

    // Visualizer Sync
    this.visualizer?.update(data.strip, data.bulb);
  }

  async post(endpoint, body) {
    try {
      if (window.desktopAPI && window.desktopAPI.post) {
        return await window.desktopAPI.post(endpoint, body);
      }
      const res = await fetch(`${this.apiBase}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch (e) {
      console.error(`Post error on ${endpoint}:`, e);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.duallumiApp = new DualLumiDesktopApp();
});
