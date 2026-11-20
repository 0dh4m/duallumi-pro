/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DualLumi PRO v3.0 - Unified Frontend Controller Engine
 * High-performance lighting management for ELK-BLEDOB Strip & KS04 Bulb
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // GLOBAL APP STATE
    // ═══════════════════════════════════════════════════════════════════════

    const state = {
        // Devices
        strip: {
            connected: false,
            connecting: false,
            power: true,
            r: 255, g: 85, b: 0,
            brightness: 100,
            effect: 0,
            color_order: 'RGB',
            address: 'BE:37:F1:00:CF:7E',
            name: 'ELK-BLEDOB Strip',
            rssi: null
        },
        bulb: {
            connected: false,
            connecting: false,
            power: true,
            r: 255, g: 85, b: 0,
            brightness: 100,
            effect: 0,
            color_order: 'RGB',
            address: '41:24:86:92:02:22',
            name: 'KS04-651420',
            rssi: null
        },

        // Mode & Target
        syncMode: true,
        colorTarget: 'all', // 'all', 'strip', 'bulb'

        // Settings
        theme: localStorage.getItem('duallumi_theme') || 'dark',
        soundEnabled: localStorage.getItem('duallumi_sound') !== 'false',
        apiKey: localStorage.getItem('duallumi_apikey') || '',

        // Color Studio
        currentHue: 20,
        currentSat: 100,
        currentVal: 100,
        currentKelvin: 4000,
        colorHistory: JSON.parse(localStorage.getItem('duallumi_color_history') || '["#FF5500","#FF0055","#00E5FF","#7C3AED","#10B981","#F59E0B"]'),

        // Custom Scenes
        customScenes: JSON.parse(localStorage.getItem('duallumi_custom_scenes') || '[]'),

        // Schedules
        schedules: [],

        // Dynamic Effects
        activeEffect: null,
        effectSpeed: 50,
        effectTimer: null,

        // Music Reactive
        musicMode: false,
        musicAmbiance: 'harmonic',
        audioContext: null,
        analyser: null,
        audioStream: null,
        musicSensitivity: 75,
        visualizerAnimId: null,

        // Screen Sync (Ambilight)
        screenSyncActive: false,
        screenStream: null,
        screenVideo: null,
        screenTimer: null,
        screenSampleMode: 'edge',

        // Circadian Rhythm
        circadianActive: false,
        circadianTimer: null,

        // Voice Control
        voiceRecognition: null,
        isListening: false,

        // Connectivity & WebSocket
        ws: null,
        wsReconnectAttempts: 0,
        lastPingTime: 0,
        pingLatency: 0,
        bluetoothRadioState: 'unknown'
    };

    // ═══════════════════════════════════════════════════════════════════════
    // AUDIO SYNTHESIZER FOR SOUND FX
    // ═══════════════════════════════════════════════════════════════════════

    const AudioFX = {
        ctx: null,

        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
        },

        playTone(freqStart, freqEnd, duration, gainVal = 0.05, type = 'sine') {
            if (!state.soundEnabled) return;
            try {
                this.init();
                if (!this.ctx) return;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), this.ctx.currentTime + duration);
                gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch(e) {}
        },

        playClick() { this.playTone(700, 350, 0.04, 0.04); },
        playPowerOn() { this.playTone(350, 850, 0.16, 0.08); },
        playPowerOff() { this.playTone(850, 180, 0.18, 0.08); },
        playChime() {
            this.playTone(523.25, 659.25, 0.12, 0.05);
            setTimeout(() => this.playTone(659.25, 783.99, 0.16, 0.05), 100);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // TOAST NOTIFICATION SYSTEM
    // ═══════════════════════════════════════════════════════════════════════

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COLOR UTILITIES
    // ═══════════════════════════════════════════════════════════════════════

    function hsvToRgb(h, s, v) {
        h = (h % 360) / 360;
        s = s / 100;
        v = v / 100;

        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const delta = max - min;
        let h = 0;

        if (delta !== 0) {
            if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / delta + 2) / 6;
            else h = ((r - g) / delta + 4) / 6;
        }
        const s = max === 0 ? 0 : delta / max;
        const v = max;

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            v: Math.round(v * 100)
        };
    }

    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const num = parseInt(hex, 16);
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const h = Math.max(0, Math.min(255, Math.round(x))).toString(16);
            return h.length === 1 ? '0' + h : h;
        }).join('').toUpperCase();
    }

    function kelvinToRgb(kelvin) {
        const temp = kelvin / 100.0;
        let r, g, b;

        if (temp <= 66) {
            r = 255;
            g = temp <= 0 ? 0 : 99.4708025861 * Math.log(temp) - 161.1195681661;
            b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
        } else {
            r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
            g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
            b = 255;
        }

        return {
            r: Math.max(0, Math.min(255, Math.round(r))),
            g: Math.max(0, Math.min(255, Math.round(g))),
            b: Math.max(0, Math.min(255, Math.round(b)))
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // API & REAL-TIME WEBSOCKET COMMUNICATION LAYER
    // ═══════════════════════════════════════════════════════════════════════

    const throttleTimers = {};

    function throttledSend(action, data, delay = 25) {
        if (throttleTimers[action]) {
            clearTimeout(throttleTimers[action]);
        }
        throttleTimers[action] = setTimeout(() => {
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ action, data }));
            } else {
                sendApiHttp(action, data);
            }
        }, delay);
    }

    async function sendApiHttp(endpoint, data = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (state.apiKey) headers['X-API-Key'] = state.apiKey;

        try {
            const res = await fetch(`/api/${endpoint}`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });
            return await res.json();
        } catch (e) {
            console.warn(`HTTP API /api/${endpoint} error:`, e);
            return { success: false, error: e.message };
        }
    }

    async function fetchStatus() {
        try {
            const headers = {};
            if (state.apiKey) headers['X-API-Key'] = state.apiKey;
            const res = await fetch('/api/status', { headers });
            if (res.ok) {
                const data = await res.json();
                updateStateFromBackend(data);
            }
        } catch (e) {
            console.warn('Status fetch warning:', e);
        }
    }

    function updateStateFromBackend(data) {
        if (!data) return;
        if (data.strip) Object.assign(state.strip, data.strip);
        if (data.bulb) Object.assign(state.bulb, data.bulb);
        if (typeof data.sync_mode === 'boolean') state.syncMode = data.sync_mode;
        if (data.schedules) state.schedules = data.schedules;
        if (data.bluetooth_radio) state.bluetoothRadioState = data.bluetooth_radio;

        // Auto-fill API key if server provides it on localhost
        if (data.api_key && !state.apiKey) {
            state.apiKey = data.api_key;
            localStorage.setItem('duallumi_apikey', state.apiKey);
        }

        updateUI();
    }

    function connectWebSocket() {
        if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8080';
        const wsUrl = `${protocol}//${host}/ws${state.apiKey ? '?api_key=' + encodeURIComponent(state.apiKey) : ''}`;

        try {
            state.ws = new WebSocket(wsUrl);

            state.ws.onopen = () => {
                state.wsReconnectAttempts = 0;
                document.getElementById('diagServerStatus').textContent = 'Connected (WS)';
                document.getElementById('diagServerStatus').className = 'text-success';
                // Start ping loop
                sendPing();
            };

            state.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'status_update' && msg.data) {
                        updateStateFromBackend(msg.data);
                    } else if (msg.type === 'pong') {
                        state.pingLatency = Math.round((performance.now() - state.lastPingTime));
                        document.getElementById('diagPing').textContent = `${state.pingLatency} ms`;
                    }
                } catch (e) {}
            };

            state.ws.onclose = () => {
                state.ws = null;
                document.getElementById('diagServerStatus').textContent = 'Reconnecting...';
                document.getElementById('diagServerStatus').className = 'text-warning';
                const delay = Math.min(8000, 1000 * Math.pow(1.5, state.wsReconnectAttempts));
                state.wsReconnectAttempts++;
                setTimeout(connectWebSocket, delay);
            };

            state.ws.onerror = () => {
                if (state.ws) state.ws.close();
            };
        } catch (e) {
            console.error('WebSocket connection error:', e);
        }
    }

    function sendPing() {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.lastPingTime = performance.now();
            state.ws.send(JSON.stringify({ action: 'ping' }));
            setTimeout(sendPing, 5000);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERACTIVE COLOR WHEEL (HSV HIGH-DPI CANVAS)
    // ═══════════════════════════════════════════════════════════════════════

    function initColorWheel() {
        const canvas = document.getElementById('colorWheelCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2 - 8;

        function drawWheel() {
            ctx.clearRect(0, 0, size, size);

            // Draw smooth HSV color wheel disk
            for (let angle = 0; angle < 360; angle += 1) {
                const startAngle = (angle - 0.5) * Math.PI / 180;
                const endAngle = (angle + 0.5) * Math.PI / 180;

                const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
                grad.addColorStop(0, '#ffffff');
                const rgb = hsvToRgb(angle, 100, 100);
                grad.addColorStop(1, `rgb(${rgb.r},${rgb.g},${rgb.b})`);

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = grad;
                ctx.fill();
            }

            // Draw current color selector cursor
            const cursorRad = (state.currentHue - 90) * Math.PI / 180;
            const cursorDist = (state.currentSat / 100) * radius;
            const cursorX = centerX + cursorDist * Math.cos(cursorRad);
            const cursorY = centerY + cursorDist * Math.sin(cursorRad);

            ctx.beginPath();
            ctx.arc(cursorX, cursorY, 9, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 6;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(cursorX, cursorY, 9, 0, Math.PI * 2);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        function pickColorFromEvent(e) {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            if (!clientX || !clientY) return;

            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (clientX - rect.left) * scaleX;
            const y = (clientY - rect.top) * scaleY;

            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
            if (angle < 0) angle += 360;

            state.currentHue = Math.round(angle);
            state.currentSat = Math.min(100, Math.round((distance / radius) * 100));

            drawWheel();
            applyActiveColor();
        }

        let isDragging = false;
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            pickColorFromEvent(e);
        });
        window.addEventListener('mousemove', (e) => {
            if (isDragging) pickColorFromEvent(e);
        });
        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                const rgb = hsvToRgb(state.currentHue, state.currentSat, 100);
                addToColorHistory(rgb.r, rgb.g, rgb.b);
            }
        });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isDragging = true;
            pickColorFromEvent(e);
        }, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (isDragging) pickColorFromEvent(e);
        });
        window.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                const rgb = hsvToRgb(state.currentHue, state.currentSat, 100);
                addToColorHistory(rgb.r, rgb.g, rgb.b);
            }
        });

        drawWheel();
    }

    function applyActiveColor() {
        const rgb = hsvToRgb(state.currentHue, state.currentSat, 100);
        const target = state.syncMode ? 'all' : state.colorTarget;

        throttledSend('color', {
            r: rgb.r,
            g: rgb.g,
            b: rgb.b,
            target: target,
            save: false
        }, 20);

        // Optimistically update state
        if (target === 'all' || target === 'strip') {
            state.strip.r = rgb.r; state.strip.g = rgb.g; state.strip.b = rgb.b; state.strip.power = true;
        }
        if (target === 'all' || target === 'bulb') {
            state.bulb.r = rgb.r; state.bulb.g = rgb.g; state.bulb.b = rgb.b; state.bulb.power = true;
        }

        updateColorPreview(rgb.r, rgb.g, rgb.b);
        updateAmbientGlows();
    }

    function updateColorPreview(r, g, b) {
        const preview = document.getElementById('currentColorPreview');
        const hexInput = document.getElementById('hexColorInput');
        const hex = rgbToHex(r, g, b);
        if (preview) preview.style.background = hex;
        if (hexInput && document.activeElement !== hexInput) hexInput.value = hex;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // QUICK VIBRANT COLOR CHIPS & HISTORY
    // ═══════════════════════════════════════════════════════════════════════

    const QUICK_COLORS = [
        '#FF0033', '#FF5500', '#FFAA00', '#FFEA00',
        '#00E676', '#00B0FF', '#0055FF', '#7C3AED',
        '#D946EF', '#EC4899', '#FFFFFF', '#FFD1A4'
    ];

    function initQuickColors() {
        const grid = document.getElementById('quickColorsGrid');
        if (!grid) return;
        grid.innerHTML = '';
        QUICK_COLORS.forEach(hex => {
            const dot = document.createElement('div');
            dot.className = 'quick-color-dot';
            dot.style.background = hex;
            dot.onclick = () => {
                AudioFX.playClick();
                applyHexColor(hex);
            };
            grid.appendChild(dot);
        });
    }

    function addToColorHistory(r, g, b) {
        const hex = rgbToHex(r, g, b);
        state.colorHistory = state.colorHistory.filter(c => c !== hex);
        state.colorHistory.unshift(hex);
        state.colorHistory = state.colorHistory.slice(0, 10);
        localStorage.setItem('duallumi_color_history', JSON.stringify(state.colorHistory));
        renderColorHistory();
    }

    function renderColorHistory() {
        const container = document.getElementById('colorHistorySwatches');
        if (!container) return;
        container.innerHTML = '';
        state.colorHistory.forEach(hex => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.background = hex;
            swatch.onclick = () => {
                AudioFX.playClick();
                applyHexColor(hex);
            };
            container.appendChild(swatch);
        });
    }

    function applyHexColor(hex) {
        const rgb = hexToRgb(hex);
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        state.currentHue = hsv.h;
        state.currentSat = hsv.s;
        initColorWheel(); // re-draw cursor
        applyActiveColor();
        addToColorHistory(rgb.r, rgb.g, rgb.b);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DESIGNER COLOR PALETTES
    // ═══════════════════════════════════════════════════════════════════════

    const DESIGNER_PALETTES = [
        { name: 'Sunset Glow', colors: ['#ff4e50', '#f9d423', '#ff7600', '#bf360c'] },
        { name: 'Ocean Deep', colors: ['#00c6ff', '#0072ff', '#2b5876', '#4e4376'] },
        { name: 'Neon Cyberpunk', colors: ['#f72585', '#7209b7', '#3a0ca3', '#4cc9f0'] },
        { name: 'Emerald Forest', colors: ['#10b981', '#059669', '#047857', '#064e3b'] },
        { name: 'Cozy Fireplace', colors: ['#ff6b6b', '#ffa502', '#ff4757', '#e84118'] },
        { name: 'Nordic Aurora', colors: ['#14b8a6', '#06b6d4', '#8b5cf6', '#3b82f6'] },
        { name: 'Pastel Dream', colors: ['#f472b6', '#c084fc', '#818cf8', '#67e8f9'] },
        { name: 'Tokyo Midnight', colors: ['#4f46e5', '#7c3aed', '#ec4899', '#06b6d4'] }
    ];

    function renderColorPalettes() {
        const container = document.getElementById('palettesGrid');
        if (!container) return;
        container.innerHTML = '';
        DESIGNER_PALETTES.forEach(pal => {
            const card = document.createElement('div');
            card.className = 'palette-card';
            card.innerHTML = `
                <div class="palette-name">${pal.name}</div>
                <div class="palette-colors">
                    ${pal.colors.map(c => `<div class="palette-color-block" style="background:${c}"></div>`).join('')}
                </div>
            `;
            card.onclick = () => {
                AudioFX.playClick();
                // Strip takes color 0, Bulb takes color 1 for dual harmony!
                const c1 = hexToRgb(pal.colors[0]);
                const c2 = hexToRgb(pal.colors[1] || pal.colors[0]);
                sendApiHttp('dual_color', {
                    strip: [c1.r, c1.g, c1.b],
                    bulb: [c2.r, c2.g, c2.b]
                });
                showToast(`Applied ${pal.name} Palette`);
            };
            container.appendChild(card);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHOTO COLOR EXTRACTION STUDIO
    // ═══════════════════════════════════════════════════════════════════════

    function initPhotoExtraction() {
        const dropZone = document.getElementById('photoDropZone');
        const fileInput = document.getElementById('photoInput');
        const swatchesContainer = document.getElementById('extractedSwatches');
        const thumb = document.getElementById('photoThumb');
        const previewWrap = document.getElementById('photoPreviewWrap');
        const promptWrap = document.getElementById('dropPrompt');
        const btnRemove = document.getElementById('btnRemovePhoto');

        if (!dropZone || !fileInput) return;

        dropZone.onclick = (e) => {
            if (e.target !== btnRemove) fileInput.click();
        };

        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
        dropZone.ondragleave = () => dropZone.classList.remove('dragover');
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                processImage(e.dataTransfer.files[0]);
            }
        };

        fileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) processImage(e.target.files[0]);
        };

        if (btnRemove) {
            btnRemove.onclick = (e) => {
                e.stopPropagation();
                previewWrap.style.display = 'none';
                promptWrap.style.display = 'flex';
                swatchesContainer.innerHTML = '';
                fileInput.value = '';
            };
        }

        function processImage(file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    thumb.src = event.target.result;
                    previewWrap.style.display = 'flex';
                    promptWrap.style.display = 'none';

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 120;
                    canvas.height = 120;
                    ctx.drawImage(img, 0, 0, 120, 120);

                    const imgData = ctx.getImageData(0, 0, 120, 120).data;
                    const extracted = [];
                    const step = Math.floor(imgData.length / 32);

                    for (let i = 0; i < imgData.length; i += step) {
                        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
                        // Filter out overly dark or flat grey colors
                        const maxVal = Math.max(r, g, b);
                        const minVal = Math.min(r, g, b);
                        if (maxVal > 50 && (maxVal - minVal) > 25) {
                            extracted.push({ r, g, b });
                        }
                    }

                    // Pick top 6 distinct colors
                    const finalColors = extracted.slice(0, 6);
                    swatchesContainer.innerHTML = '';
                    finalColors.forEach(rgb => {
                        const swatch = document.createElement('div');
                        swatch.className = 'extracted-swatch';
                        swatch.style.background = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
                        swatch.title = `RGB(${rgb.r},${rgb.g},${rgb.b}) - Click to apply`;
                        swatch.onclick = (e) => {
                            e.stopPropagation();
                            AudioFX.playClick();
                            applyHexColor(rgbToHex(rgb.r, rgb.g, rgb.b));
                        };
                        swatchesContainer.appendChild(swatch);
                    });

                    showToast('Colors extracted from photo!', 'success');
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DYNAMIC LIGHTING EFFECTS STUDIO
    // ═══════════════════════════════════════════════════════════════════════

    const EFFECTS_LIST = [
        { id: 'rainbow', name: 'Rainbow Flow', icon: '🌈', isHw: false },
        { id: 'aurora', name: 'Aurora Borealis', icon: '🌌', isHw: false },
        { id: 'candle', name: 'Candle Flicker', icon: '🕯️', isHw: false },
        { id: 'cyberpunk', name: 'Cyberpunk Pulse', icon: '⚡', isHw: false },
        { id: 'fireplace', name: 'Fireplace Embers', icon: '🔥', isHw: false },
        { id: 'disco', name: 'Disco Strobe', icon: '🪩', isHw: false },
        { id: 'sunset', name: 'Sunset Drift', icon: '🌅', isHw: false },
        { id: 'ocean', name: 'Ocean Swell', icon: '🌊', isHw: false },
        { id: 'police', name: 'Police Flasher', icon: '🚨', isHw: false },
        { id: 'breathe', name: 'Breathing Pulse', icon: '💫', isHw: false },
        { id: 'hw_jump', name: '7-Color Jump', icon: '🔀', isHw: true, hwId: 0x88 },
        { id: 'hw_fade', name: '7-Color Fade', icon: '🔄', isHw: true, hwId: 0x8A }
    ];

    function initEffectsStudio() {
        const grid = document.getElementById('effectsGrid');
        const modal = document.getElementById('effectsModal');
        const openBtn = document.getElementById('btnOpenEffects');
        const closeBtn = document.getElementById('closeEffectsBtn');
        const stopBtn = document.getElementById('btnStopEffects');
        const speedSlider = document.getElementById('sliderEffectSpeed');
        const valSpeed = document.getElementById('valEffectSpeed');

        if (openBtn && modal) openBtn.onclick = () => modal.classList.add('active');
        if (closeBtn && modal) closeBtn.onclick = () => modal.classList.remove('active');

        if (speedSlider) {
            speedSlider.oninput = (e) => {
                state.effectSpeed = parseInt(e.target.value);
                valSpeed.textContent = state.effectSpeed + '%';
            };
        }

        if (stopBtn) {
            stopBtn.onclick = () => {
                stopActiveEffect();
                showToast('Dynamic effects stopped.');
            };
        }

        if (grid) {
            grid.innerHTML = '';
            EFFECTS_LIST.forEach(eff => {
                const card = document.createElement('div');
                card.className = `effect-card ${state.activeEffect === eff.id ? 'active' : ''}`;
                card.dataset.id = eff.id;
                card.innerHTML = `
                    <span style="font-size:24px;">${eff.icon}</span>
                    <div>
                        <strong style="font-size:14px; display:block;">${eff.name}</strong>
                        <small style="font-size:11px; color:var(--text-secondary);">${eff.isHw ? 'Hardware Native' : 'Dynamic Smooth'}</small>
                    </div>
                `;
                card.onclick = () => {
                    AudioFX.playClick();
                    document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    startEffect(eff);
                };
                grid.appendChild(card);
            });
        }
    }

    function stopActiveEffect() {
        if (state.effectTimer) {
            clearInterval(state.effectTimer);
            state.effectTimer = null;
        }
        state.activeEffect = null;
        document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
    }

    function startEffect(eff) {
        stopActiveEffect();
        state.activeEffect = eff.id;

        if (eff.isHw) {
            sendApiHttp('effect', {
                effect: eff.hwId,
                speed: state.effectSpeed,
                target: state.syncMode ? 'all' : state.colorTarget
            });
            showToast(`Started ${eff.name}`);
            return;
        }

        // Software Dynamic Animation Engine
        let step = 0;
        const interval = Math.max(30, 200 - state.effectSpeed * 1.7);

        state.effectTimer = setInterval(() => {
            step++;
            let r = 255, g = 0, b = 0;

            if (eff.id === 'rainbow') {
                const hue = (step * 4) % 360;
                const rgb = hsvToRgb(hue, 100, 100);
                r = rgb.r; g = rgb.g; b = rgb.b;
            } else if (eff.id === 'aurora') {
                const wave = Math.sin(step * 0.1);
                r = Math.round(10 + 20 * wave);
                g = Math.round(180 + 75 * wave);
                b = Math.round(160 + 95 * Math.cos(step * 0.1));
            } else if (eff.id === 'candle') {
                const flicker = Math.random() * 0.4 + 0.6;
                r = Math.round(255 * flicker);
                g = Math.round(120 * flicker);
                b = Math.round(20 * flicker);
            } else if (eff.id === 'cyberpunk') {
                if (step % 10 < 5) { r = 236; g = 72; b = 153; }
                else { r = 6; g = 182; b = 212; }
            } else if (eff.id === 'fireplace') {
                const fl = Math.random() * 0.35 + 0.65;
                r = Math.round(255 * fl);
                g = Math.round(60 * fl + Math.random() * 30);
                b = Math.round(10 * fl);
            } else if (eff.id === 'police') {
                if (step % 6 < 3) { r = 255; g = 0; b = 0; }
                else { r = 0; g = 50; b = 255; }
            } else if (eff.id === 'breathe') {
                const s = (Math.sin(step * 0.1) + 1) / 2;
                r = Math.round(state.strip.r * (0.2 + 0.8 * s));
                g = Math.round(state.strip.g * (0.2 + 0.8 * s));
                b = Math.round(state.strip.b * (0.2 + 0.8 * s));
            }

            throttledSend('color', {
                r, g, b,
                target: state.syncMode ? 'all' : state.colorTarget,
                save: false
            }, 30);

        }, interval);

        showToast(`Running ${eff.name}...`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MUSIC REACTIVE BEAT-SYNC WITH 16-BAND EQUALIZER
    // ═══════════════════════════════════════════════════════════════════════

    async function toggleMusicMode() {
        const btn = document.getElementById('btnToggleMusic');
        const status = document.getElementById('statusMusic');

        if (state.musicMode) {
            // Stop music mode
            state.musicMode = false;
            if (state.visualizerAnimId) cancelAnimationFrame(state.visualizerAnimId);
            if (state.audioStream) {
                state.audioStream.getTracks().forEach(t => t.stop());
                state.audioStream = null;
            }
            if (btn) btn.textContent = 'Start Music Sync';
            if (status) status.textContent = 'Status: Inactive';
            showToast('Music Reactive Mode stopped.');
            return;
        }

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!state.audioContext) state.audioContext = new AudioCtx();
            if (state.audioContext.state === 'suspended') await state.audioContext.resume();

            state.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = state.audioContext.createMediaStreamSource(state.audioStream);

            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = 64; // 32 frequency bins
            state.analyser.smoothingTimeConstant = 0.8;
            source.connect(state.analyser);

            state.musicMode = true;
            if (btn) btn.textContent = 'Stop Music Sync';
            if (status) status.textContent = 'Status: Live & Listening 🎵';
            showToast('Music Reactive Beat-Sync Active!', 'success');

            runMusicVisualizerAndBeatSync();

        } catch (e) {
            console.error('Microphone access failed:', e);
            showToast('Microphone permission required for Music Mode', 'error');
        }
    }

    function runMusicVisualizerAndBeatSync() {
        if (!state.musicMode || !state.analyser) return;

        const canvas = document.getElementById('musicVisualizer');
        const ctx = canvas ? canvas.getContext('2d') : null;
        const binCount = 16;
        const dataArray = new Uint8Array(state.analyser.frequencyBinCount);

        let lastSendTime = 0;

        function renderFrame(now) {
            if (!state.musicMode) return;
            state.visualizerAnimId = requestAnimationFrame(renderFrame);

            state.analyser.getByteFrequencyData(dataArray);

            // Draw 16-band EQ bars on canvas
            if (ctx && canvas) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const barWidth = (canvas.width / binCount) - 3;

                for (let i = 0; i < binCount; i++) {
                    const val = dataArray[i * 2] || 0;
                    const barHeight = (val / 255) * canvas.height;
                    const x = i * (barWidth + 3);
                    const y = canvas.height - barHeight;

                    const hue = (i / binCount) * 280;
                    ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
                    ctx.fillRect(x, y, barWidth, barHeight);
                }
            }

            // Rate-limit BLE hardware writes to ~25fps (40ms)
            if (now - lastSendTime > 40) {
                lastSendTime = now;

                const bass = (dataArray[0] + dataArray[1] + dataArray[2]) / 3;
                const mid = (dataArray[4] + dataArray[5] + dataArray[6]) / 3;
                const treble = (dataArray[8] + dataArray[9] + dataArray[10]) / 3;
                const mult = state.musicSensitivity / 100;

                let r = 0, g = 0, b = 0;

                if (state.musicAmbiance === 'harmonic') {
                    const avg = (bass + mid + treble) / 3;
                    const hue = (avg * 1.4) % 360;
                    const rgb = hsvToRgb(hue, 100, Math.min(100, avg * mult));
                    r = rgb.r; g = rgb.g; b = rgb.b;
                } else if (state.musicAmbiance === 'beat') {
                    // Flash intense pulse on bass kicks
                    if (bass * mult > 140) {
                        r = 255; g = 40; b = 0;
                    } else {
                        r = 20; g = 60; b = 180;
                    }
                } else if (state.musicAmbiance === 'spectrum') {
                    // Bass = Red, Mid = Green, Treble = Blue
                    r = Math.min(255, Math.round(bass * 1.2 * mult));
                    g = Math.min(255, Math.round(mid * 1.1 * mult));
                    b = Math.min(255, Math.round(treble * 1.3 * mult));
                } else if (state.musicAmbiance === 'strobe') {
                    if (bass * mult > 160) { r = 255; g = 255; b = 255; }
                    else { r = 0; g = 0; b = 0; }
                }

                throttledSend('color', {
                    r, g, b,
                    target: state.syncMode ? 'all' : state.colorTarget,
                    save: false
                }, 35);
            }
        }

        renderFrame(performance.now());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AMBILIGHT SCREEN SYNC
    // ═══════════════════════════════════════════════════════════════════════

    async function toggleScreenSync() {
        const btn = document.getElementById('btnToggleScreenSync');
        const status = document.getElementById('statusScreenSync');

        if (state.screenSyncActive) {
            state.screenSyncActive = false;
            if (state.screenTimer) clearInterval(state.screenTimer);
            if (state.screenStream) {
                state.screenStream.getTracks().forEach(t => t.stop());
                state.screenStream = null;
            }
            if (btn) btn.textContent = 'Start Screen Sync';
            if (status) status.textContent = 'Status: Inactive';
            showToast('Screen Sync Ambilight stopped.');
            return;
        }

        try {
            state.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 20 }
            });

            state.screenVideo = document.createElement('video');
            state.screenVideo.srcObject = state.screenStream;
            state.screenVideo.play();

            state.screenSyncActive = true;
            if (btn) btn.textContent = 'Stop Screen Sync';
            if (status) status.textContent = 'Status: Synchronizing Ambilight 🖥️';
            showToast('Ambilight Screen Sync Active!', 'success');

            const canvas = document.getElementById('screenPreviewCanvas');
            const glow = document.getElementById('screenGlowPreview');
            const ctx = canvas.getContext('2d');

            state.screenTimer = setInterval(() => {
                if (!state.screenSyncActive || !state.screenVideo.videoWidth) return;

                ctx.drawImage(state.screenVideo, 0, 0, canvas.width, canvas.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                let rSum = 0, gSum = 0, bSum = 0, count = 0;

                for (let i = 0; i < imgData.length; i += 16) {
                    rSum += imgData[i];
                    gSum += imgData[i + 1];
                    bSum += imgData[i + 2];
                    count++;
                }

                const r = Math.round(rSum / count);
                const g = Math.round(gSum / count);
                const b = Math.round(bSum / count);

                if (glow) glow.style.boxShadow = `inset 0 0 40px rgb(${r},${g},${b})`;

                throttledSend('color', {
                    r, g, b,
                    target: state.syncMode ? 'all' : state.colorTarget,
                    save: false
                }, 40);

            }, 60);

        } catch (e) {
            console.error('Screen capture error:', e);
            showToast('Screen share permission required for Ambilight', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CIRCADIAN RHYTHM MODE
    // ═══════════════════════════════════════════════════════════════════════

    function initCircadianMode() {
        const toggle = document.getElementById('circadianSwitch');
        const status = document.getElementById('circadianStatus');

        if (!toggle) return;

        toggle.onchange = () => {
            state.circadianActive = toggle.checked;
            AudioFX.playClick();

            if (state.circadianActive) {
                if (status) status.textContent = 'Status: Active (Auto-regulating)';
                showToast('Circadian Rhythm Mode Enabled ☀️');
                applyCircadianKelvin();
                state.circadianTimer = setInterval(applyCircadianKelvin, 300000); // every 5m
            } else {
                if (status) status.textContent = 'Status: Inactive';
                if (state.circadianTimer) clearInterval(state.circadianTimer);
                showToast('Circadian Rhythm Mode Disabled');
            }
        };
    }

    function applyCircadianKelvin() {
        const hour = new Date().getHours();
        let kelvin = 4000;

        if (hour >= 6 && hour < 9) kelvin = 3000;
        else if (hour >= 9 && hour < 17) kelvin = 5500;
        else if (hour >= 17 && hour < 21) kelvin = 3500;
        else kelvin = 2200;

        state.currentKelvin = kelvin;
        document.getElementById('valKelvin').textContent = `${kelvin}K`;
        document.getElementById('kelvinSlider').value = kelvin;

        sendApiHttp('color_temp', { kelvin, target: 'all' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SMART SCHEDULING SYSTEM
    // ═══════════════════════════════════════════════════════════════════════

    function initSchedules() {
        const openBtn = document.getElementById('btnOpenSchedules');
        const closeBtn = document.getElementById('closeSchedulesBtn');
        const modal = document.getElementById('schedulesModal');
        const addBtn = document.getElementById('btnAddSchedule');

        if (openBtn && modal) openBtn.onclick = () => { renderSchedules(); modal.classList.add('active'); };
        if (closeBtn && modal) closeBtn.onclick = () => modal.classList.remove('active');

        if (addBtn) {
            addBtn.onclick = () => {
                const time = document.getElementById('newScheduleTime').value;
                const action = document.getElementById('newScheduleAction').value;
                if (!time) return;

                const newSch = {
                    id: Date.now(),
                    time: time,
                    action: action,
                    enabled: true
                };

                state.schedules.push(newSch);
                sendApiHttp('schedules', { schedules: state.schedules });
                renderSchedules();
                showToast(`Schedule added for ${time}`);
            };
        }
    }

    function renderSchedules() {
        const list = document.getElementById('schedulesList');
        if (!list) return;

        if (state.schedules.length === 0) {
            list.innerHTML = '<p class="text-secondary">No automated schedules currently set.</p>';
            return;
        }

        list.innerHTML = '';
        state.schedules.forEach(sch => {
            const item = document.createElement('div');
            item.className = 'schedule-item';
            const actionLabels = {
                sunrise: '🌅 Sunrise Alarm (Warm 100%)',
                power_on: '💡 Power ON',
                sunset: '🌇 Sunset Glow (Relaxing Amber)',
                power_off: '🌙 Power OFF (Sleep)'
            };

            item.innerHTML = `
                <div class="sch-left">
                    <span class="sch-time">${sch.time}</span>
                    <span class="sch-desc">${actionLabels[sch.action] || sch.action}</span>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <label class="switch switch-sm">
                        <input type="checkbox" ${sch.enabled ? 'checked' : ''} data-id="${sch.id}" class="sch-toggle">
                        <span class="slider round"></span>
                    </label>
                    <button class="btn btn-secondary btn-sm sch-del" data-id="${sch.id}">🗑️</button>
                </div>
            `;

            item.querySelector('.sch-toggle').onchange = (e) => {
                sch.enabled = e.target.checked;
                sendApiHttp('schedules', { schedules: state.schedules });
            };

            item.querySelector('.sch-del').onclick = () => {
                state.schedules = state.schedules.filter(s => s.id !== sch.id);
                sendApiHttp('schedules', { schedules: state.schedules });
                renderSchedules();
                showToast('Schedule deleted.');
            };

            list.appendChild(item);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BLUETOOTH LE SCANNER MODAL
    // ═══════════════════════════════════════════════════════════════════════

    function initScanner() {
        const openBtn = document.getElementById('openScanBtn');
        const closeBtn = document.getElementById('closeScanBtn');
        const modal = document.getElementById('scanModal');
        const scanBtn = document.getElementById('btnStartScan');
        const statusText = document.getElementById('scanStatusText');
        const container = document.getElementById('scanResultsContainer');

        if (openBtn && modal) openBtn.onclick = () => modal.classList.add('active');
        if (closeBtn && modal) closeBtn.onclick = () => modal.classList.remove('active');

        if (scanBtn) {
            scanBtn.onclick = async () => {
                AudioFX.playClick();
                scanBtn.disabled = true;
                statusText.textContent = 'Scanning nearby Bluetooth LE devices (5 seconds)... 📡';
                container.innerHTML = '<div style="text-align:center; padding:30px;"><div class="voice-wave" style="justify-content:center;"><span></span><span></span><span></span><span></span><span></span></div><p style="margin-top:14px;">Searching radio frequencies...</p></div>';

                try {
                    const res = await fetch('/api/scan');
                    const data = await res.json();
                    scanBtn.disabled = false;

                    if (data.success && data.devices && data.devices.length > 0) {
                        statusText.textContent = `Found ${data.devices.length} Bluetooth devices nearby.`;
                        container.innerHTML = '';

                        data.devices.forEach(dev => {
                            const card = document.createElement('div');
                            card.className = 'scan-card';
                            const badgeColor = dev.type === 'strip' ? 'var(--accent)' : (dev.type === 'bulb' ? '#f59e0b' : '#64748b');

                            card.innerHTML = `
                                <div class="scan-card-left">
                                    <span style="font-size:22px;">${dev.type === 'strip' ? '🌈' : (dev.type === 'bulb' ? '💡' : '📡')}</span>
                                    <div>
                                        <div class="scan-dev-name">${dev.name} <span class="device-badge" style="background:${badgeColor}; color:#fff; font-size:10px;">${dev.type.toUpperCase()}</span></div>
                                        <div class="scan-dev-mac">${dev.address} &bull; Signal: ${dev.rssi} dBm</div>
                                    </div>
                                </div>
                                <div class="scan-card-actions">
                                    <button class="btn btn-secondary btn-sm btn-set-strip" data-addr="${dev.address}" data-name="${dev.name}">Set as Strip</button>
                                    <button class="btn btn-primary btn-sm btn-set-bulb" data-addr="${dev.address}" data-name="${dev.name}">Set as Bulb</button>
                                </div>
                            `;

                            card.querySelector('.btn-set-strip').onclick = async () => {
                                AudioFX.playClick();
                                await sendApiHttp('set_device', { target: 'strip', address: dev.address, name: dev.name });
                                showToast(`Assigned ${dev.name} as LED Strip!`, 'success');
                                fetchStatus();
                            };

                            card.querySelector('.btn-set-bulb').onclick = async () => {
                                AudioFX.playClick();
                                await sendApiHttp('set_device', { target: 'bulb', address: dev.address, name: dev.name });
                                showToast(`Assigned ${dev.name} as Smart Bulb!`, 'success');
                                fetchStatus();
                            };

                            container.appendChild(card);
                        });
                    } else {
                        statusText.textContent = 'Scan finished. No supported devices discovered.';
                        container.innerHTML = '<div class="empty-scan-state"><p>No devices found. Ensure the lights are plugged into the wall and phone apps are closed.</p></div>';
                    }
                } catch (e) {
                    scanBtn.disabled = false;
                    statusText.textContent = 'Scan failed: ' + e.message;
                }
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VOICE CONTROL (MOROCCAN DARIJA, ARABIC, ENGLISH)
    // ═══════════════════════════════════════════════════════════════════════

    function initVoiceControl() {
        const openBtn = document.getElementById('btnVoiceControl');
        const closeBtn = document.getElementById('closeVoiceBtn');
        const modal = document.getElementById('voiceModal');
        const startBtn = document.getElementById('btnStartVoiceModal');
        const transcriptEl = document.getElementById('voiceTranscript');

        if (openBtn && modal) openBtn.onclick = () => modal.classList.add('active');
        if (closeBtn && modal) closeBtn.onclick = () => modal.classList.remove('active');

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (startBtn) {
            startBtn.onclick = () => {
                if (!SpeechRec) {
                    showToast('Voice Recognition not supported in this browser.', 'error');
                    return;
                }

                if (!state.voiceRecognition) {
                    state.voiceRecognition = new SpeechRec();
                    state.voiceRecognition.continuous = false;
                    state.voiceRecognition.lang = 'ar-MA'; // Moroccan Arabic / Darija default

                    state.voiceRecognition.onstart = () => {
                        state.isListening = true;
                        if (transcriptEl) transcriptEl.textContent = 'Listening... تكلم دابا 🎙️';
                    };

                    state.voiceRecognition.onresult = (e) => {
                        const transcript = e.results[0][0].transcript.toLowerCase();
                        if (transcriptEl) transcriptEl.textContent = `"${transcript}"`;
                        processVoiceCommand(transcript);
                    };

                    state.voiceRecognition.onerror = (e) => {
                        state.isListening = false;
                        if (transcriptEl) transcriptEl.textContent = 'Voice error: ' + e.error;
                    };

                    state.voiceRecognition.onend = () => {
                        state.isListening = false;
                    };
                }

                state.voiceRecognition.start();
            };
        }
    }

    function processVoiceCommand(text) {
        // Power ON
        if (text.includes('شعل') || text.includes('تشغيل') || text.includes('turn on') || text.includes('lights on')) {
            sendApiHttp('power', { power: true, target: 'all' });
            showToast('Voice: Lights Powered ON! 💡', 'success');
        }
        // Power OFF
        else if (text.includes('طفي') || text.includes('إطفاء') || text.includes('turn off') || text.includes('lights off')) {
            sendApiHttp('power', { power: false, target: 'all' });
            showToast('Voice: Lights Powered OFF! 🌙', 'info');
        }
        // Colors
        else if (text.includes('حمر') || text.includes('أحمر') || text.includes('red')) {
            applyHexColor('#FF0033');
            showToast('Voice: Applied Red 🔴');
        }
        else if (text.includes('زرق') || text.includes('أزرق') || text.includes('blue')) {
            applyHexColor('#0066FF');
            showToast('Voice: Applied Blue 🔵');
        }
        else if (text.includes('خضر') || text.includes('أخضر') || text.includes('green')) {
            applyHexColor('#00E676');
            showToast('Voice: Applied Green 🟢');
        }
        else if (text.includes('صفر') || text.includes('أصفر') || text.includes('yellow')) {
            applyHexColor('#FFEA00');
            showToast('Voice: Applied Yellow 🟡');
        }
        else if (text.includes('بيض') || text.includes('أبيض') || text.includes('white')) {
            applyHexColor('#FFFFFF');
            showToast('Voice: Applied White ⚪');
        }
        // Brightness
        else if (text.includes('زيد') || text.includes('brighter') || text.includes('raise')) {
            const b = Math.min(100, state.strip.brightness + 25);
            sendApiHttp('brightness', { brightness: b, target: 'all' });
            showToast(`Voice: Brightness increased to ${b}%`);
        }
        else if (text.includes('نقص') || text.includes('dimmer') || text.includes('lower')) {
            const b = Math.max(1, state.strip.brightness - 25);
            sendApiHttp('brightness', { brightness: b, target: 'all' });
            showToast(`Voice: Brightness lowered to ${b}%`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SETTINGS, BLUETOOTH RADIO & DIAGNOSTICS
    // ═══════════════════════════════════════════════════════════════════════

    function initSettings() {
        const openBtn = document.getElementById('openSettingsBtn');
        const closeBtn = document.getElementById('closeSettingsBtn');
        const modal = document.getElementById('settingsModal');
        const keyInput = document.getElementById('apiKeyInput');
        const saveKeyBtn = document.getElementById('saveApiKeyBtn');
        const btnToggleBt = document.getElementById('btnToggleBtRadio');
        const pillBt = document.getElementById('pillBtRadio');

        if (openBtn && modal) {
            openBtn.onclick = () => {
                if (keyInput) keyInput.value = state.apiKey;
                modal.classList.add('active');
            };
        }
        if (closeBtn && modal) closeBtn.onclick = () => modal.classList.remove('active');

        if (saveKeyBtn && keyInput) {
            saveKeyBtn.onclick = () => {
                state.apiKey = keyInput.value.trim();
                localStorage.setItem('duallumi_apikey', state.apiKey);
                modal.classList.remove('active');
                showToast('API Key saved!', 'success');
                if (state.ws) state.ws.close();
                connectWebSocket();
            };
        }

        async function toggleBtRadio() {
            AudioFX.playClick();
            const targetState = state.bluetoothRadioState !== 'on';
            btnToggleBt.disabled = true;
            btnToggleBt.textContent = 'Updating Radio...';
            const res = await sendApiHttp('bluetooth_power', { power: targetState });
            btnToggleBt.disabled = false;
            if (res.success) {
                state.bluetoothRadioState = res.bluetooth_on ? 'on' : 'off';
                showToast(`Bluetooth radio powered ${res.bluetooth_on ? 'ON' : 'OFF'}`);
                updateUI();
            }
        }

        if (btnToggleBt) btnToggleBt.onclick = toggleBtRadio;
        if (pillBt) pillBt.onclick = toggleBtRadio;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UI REFRESH & RENDERING ENGINE
    // ═══════════════════════════════════════════════════════════════════════

    function updateUI() {
        // Theme
        document.documentElement.setAttribute('data-theme', state.theme);
        const themeSelector = document.getElementById('themeSelector');
        if (themeSelector) themeSelector.value = state.theme;

        // Bluetooth Radio Pill
        const dotBt = document.getElementById('dotBtRadio');
        const textBt = document.getElementById('textBtRadio');
        const btnToggleBt = document.getElementById('btnToggleBtRadio');
        const descBt = document.getElementById('btRadioStatusDesc');

        if (state.bluetoothRadioState === 'on') {
            if (dotBt) { dotBt.className = 'status-dot dot-on'; }
            if (textBt) { textBt.textContent = 'Bluetooth: Active'; }
            if (btnToggleBt) { btnToggleBt.textContent = 'Turn Bluetooth OFF'; }
            if (descBt) { descBt.textContent = 'Radio is powered ON and discovering BLE peripherals.'; }
        } else if (state.bluetoothRadioState === 'off') {
            if (dotBt) { dotBt.className = 'status-dot dot-off'; }
            if (textBt) { textBt.textContent = 'Bluetooth: OFF'; }
            if (btnToggleBt) { btnToggleBt.textContent = 'Turn Bluetooth ON'; }
            if (descBt) { descBt.textContent = 'Radio is currently disabled in Windows.'; }
        } else {
            if (dotBt) { dotBt.className = 'status-dot dot-warn'; }
            if (textBt) { textBt.textContent = 'Bluetooth: Standby'; }
        }

        // Strip Badge & Pill
        const dotStrip = document.getElementById('dotStrip');
        const textStrip = document.getElementById('textStrip');
        const badgeStrip = document.getElementById('badgeStrip');
        const btnConnectStrip = document.getElementById('btnConnectStrip');

        if (state.strip.connected) {
            if (dotStrip) dotStrip.className = 'status-dot dot-on';
            if (textStrip) textStrip.textContent = 'Strip: Connected';
            if (badgeStrip) { badgeStrip.textContent = 'Connected'; badgeStrip.className = 'device-badge badge-connected'; }
            if (btnConnectStrip) btnConnectStrip.textContent = 'Disconnect';
        } else if (state.strip.connecting) {
            if (dotStrip) dotStrip.className = 'status-dot dot-warn';
            if (textStrip) textStrip.textContent = 'Strip: Connecting...';
            if (badgeStrip) { badgeStrip.textContent = 'Connecting...'; badgeStrip.className = 'device-badge badge-connecting'; }
            if (btnConnectStrip) btnConnectStrip.textContent = 'Connecting...';
        } else {
            if (dotStrip) dotStrip.className = 'status-dot dot-off';
            if (textStrip) textStrip.textContent = 'Strip: Offline';
            if (badgeStrip) { badgeStrip.textContent = 'Disconnected'; badgeStrip.className = 'device-badge badge-disconnected'; }
            if (btnConnectStrip) btnConnectStrip.textContent = 'Connect';
        }

        // Bulb Badge & Pill
        const dotBulb = document.getElementById('dotBulb');
        const textBulb = document.getElementById('textBulb');
        const badgeBulb = document.getElementById('badgeBulb');
        const btnConnectBulb = document.getElementById('btnConnectBulb');

        if (state.bulb.connected) {
            if (dotBulb) dotBulb.className = 'status-dot dot-on';
            if (textBulb) textBulb.textContent = 'Bulb: Connected';
            if (badgeBulb) { badgeBulb.textContent = 'Connected'; badgeBulb.className = 'device-badge badge-connected'; }
            if (btnConnectBulb) btnConnectBulb.textContent = 'Disconnect';
        } else if (state.bulb.connecting) {
            if (dotBulb) dotBulb.className = 'status-dot dot-warn';
            if (textBulb) textBulb.textContent = 'Bulb: Connecting...';
            if (badgeBulb) { badgeBulb.textContent = 'Connecting...'; badgeBulb.className = 'device-badge badge-connecting'; }
            if (btnConnectBulb) btnConnectBulb.textContent = 'Connecting...';
        } else {
            if (dotBulb) dotBulb.className = 'status-dot dot-off';
            if (textBulb) textBulb.textContent = 'Bulb: Offline';
            if (badgeBulb) { badgeBulb.textContent = 'Disconnected'; badgeBulb.className = 'device-badge badge-disconnected'; }
            if (btnConnectBulb) btnConnectBulb.textContent = 'Connect';
        }

        // Master Power Switch & LED
        const masterSwitch = document.getElementById('masterPowerSwitch');
        const masterLed = document.getElementById('masterPowerLed');
        const anyOn = state.strip.power || state.bulb.power;
        if (masterSwitch && document.activeElement !== masterSwitch) masterSwitch.checked = anyOn;
        if (masterLed) masterLed.classList.toggle('off', !anyOn);

        // Individual Device Cards
        const pStrip = document.getElementById('powerStrip');
        if (pStrip && document.activeElement !== pStrip) pStrip.checked = state.strip.power;
        const bStrip = document.getElementById('sliderBrightnessStrip');
        if (bStrip && document.activeElement !== bStrip) bStrip.value = state.strip.brightness;
        document.getElementById('valBrightnessStrip').textContent = state.strip.brightness + '%';
        document.getElementById('previewStrip').style.background = rgbToHex(state.strip.r, state.strip.g, state.strip.b);
        document.getElementById('calibStrip').value = state.strip.color_order || 'RGB';

        const pBulb = document.getElementById('powerBulb');
        if (pBulb && document.activeElement !== pBulb) pBulb.checked = state.bulb.power;
        const bBulb = document.getElementById('sliderBrightnessBulb');
        if (bBulb && document.activeElement !== bBulb) bBulb.value = state.bulb.brightness;
        document.getElementById('valBrightnessBulb').textContent = state.bulb.brightness + '%';
        document.getElementById('previewBulb').style.background = rgbToHex(state.bulb.r, state.bulb.g, state.bulb.b);
        document.getElementById('calibBulb').value = state.bulb.color_order || 'RGB';

        // Master Hero Brightness
        const avgB = state.syncMode ? state.strip.brightness : Math.round((state.strip.brightness + state.bulb.brightness) / 2);
        const heroB = document.getElementById('heroBrightnessSlider');
        if (heroB && document.activeElement !== heroB) heroB.value = avgB;
        document.getElementById('valHeroBrightness').textContent = avgB + '%';

        // Sync vs Independent Mode Buttons
        const btnSync = document.getElementById('btnSyncMode');
        const btnIndep = document.getElementById('btnIndepMode');
        if (btnSync && btnIndep) {
            btnSync.classList.toggle('active', state.syncMode);
            btnIndep.classList.toggle('active', !state.syncMode);
        }

        // MAC Addresses in Diagnostics
        document.getElementById('diagStripMac').textContent = state.strip.address || '--';
        document.getElementById('diagBulbMac').textContent = state.bulb.address || '--';

        updateAmbientGlows();
    }

    function updateAmbientGlows() {
        const g1 = document.getElementById('ambientGlow1');
        const g2 = document.getElementById('ambientGlow2');
        if (g1) {
            g1.style.background = state.strip.power ? rgbToHex(state.strip.r, state.strip.g, state.strip.b) : '#000000';
        }
        if (g2) {
            g2.style.background = state.bulb.power ? rgbToHex(state.bulb.r, state.bulb.g, state.bulb.b) : '#000000';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRESET & CUSTOM SCENES
    // ═══════════════════════════════════════════════════════════════════════

    const PRESET_SCENES = [
        { name: 'Cinema Ambiance', emoji: '🎬', r: 75, g: 20, b: 50, bVal: 30 },
        { name: 'Cyberpunk Neon', emoji: '⚡', r: 236, g: 72, b: 153, bVal: 100 },
        { name: 'Night Relaxation', emoji: '🌙', r: 35, g: 65, b: 130, bVal: 40 },
        { name: 'Deep Focus', emoji: '🧠', r: 255, g: 200, b: 100, bVal: 75 },
        { name: 'Cozy Fireplace', emoji: '🔥', r: 255, g: 110, b: 20, bVal: 60 },
        { name: 'Ocean Depths', emoji: '🌊', r: 10, g: 85, b: 160, bVal: 50 }
    ];

    function renderPresetScenes() {
        const grid = document.getElementById('presetScenesGrid');
        if (!grid) return;
        grid.innerHTML = '';
        PRESET_SCENES.forEach(scene => {
            const card = document.createElement('div');
            card.className = 'scene-card';
            card.innerHTML = `
                <span class="scene-emoji">${scene.emoji}</span>
                <span class="scene-name">${scene.name}</span>
            `;
            card.onclick = () => {
                AudioFX.playClick();
                sendApiHttp('color', { r: scene.r, g: scene.g, b: scene.b, target: 'all' });
                sendApiHttp('brightness', { brightness: scene.bVal, target: 'all' });
                showToast(`Applied: ${scene.name}`);
            };
            grid.appendChild(card);
        });
    }

    function initCustomScenes() {
        const btnSave = document.getElementById('btnSaveCustomScene');
        if (btnSave) {
            btnSave.onclick = () => {
                AudioFX.playClick();
                const name = prompt('Enter a name for this custom scene:');
                if (!name) return;

                const newScene = {
                    id: Date.now(),
                    name: name,
                    emoji: '💾',
                    strip: { r: state.strip.r, g: state.strip.g, b: state.strip.b, brightness: state.strip.brightness },
                    bulb: { r: state.bulb.r, g: state.bulb.g, b: state.bulb.b, brightness: state.bulb.brightness }
                };

                state.customScenes.push(newScene);
                localStorage.setItem('duallumi_custom_scenes', JSON.stringify(state.customScenes));
                renderCustomScenes();
                showToast(`Saved scene "${name}"!`, 'success');
            };
        }
        renderCustomScenes();
    }

    function renderCustomScenes() {
        const grid = document.getElementById('customScenesGrid');
        if (!grid) return;
        grid.innerHTML = '';

        if (state.customScenes.length === 0) {
            grid.innerHTML = '<div class="empty-scenes-prompt">No custom scenes saved yet. Click "+ Save Current Scene" above!</div>';
            return;
        }

        state.customScenes.forEach(scene => {
            const card = document.createElement('div');
            card.className = 'scene-card custom-scene';
            card.innerHTML = `
                <button class="delete-scene" data-id="${scene.id}" title="Delete">&times;</button>
                <span class="scene-emoji">${scene.emoji}</span>
                <span class="scene-name">${scene.name}</span>
            `;

            card.querySelector('.delete-scene').onclick = (e) => {
                e.stopPropagation();
                state.customScenes = state.customScenes.filter(s => s.id !== scene.id);
                localStorage.setItem('duallumi_custom_scenes', JSON.stringify(state.customScenes));
                renderCustomScenes();
                showToast(`Deleted scene "${scene.name}".`);
            };

            card.onclick = () => {
                AudioFX.playClick();
                if (scene.strip && scene.bulb) {
                    sendApiHttp('dual_color', {
                        strip: [scene.strip.r, scene.strip.g, scene.strip.b],
                        bulb: [scene.bulb.r, scene.bulb.g, scene.bulb.b]
                    });
                    sendApiHttp('brightness', { brightness: scene.strip.brightness, target: 'strip' });
                    sendApiHttp('brightness', { brightness: scene.bulb.brightness, target: 'bulb' });
                }
                showToast(`Applied: ${scene.name}`);
            };

            grid.appendChild(card);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT LISTENERS BINDING
    // ═══════════════════════════════════════════════════════════════════════

    function initEventListeners() {
        // Theme selection
        const themeSel = document.getElementById('themeSelector');
        if (themeSel) {
            themeSel.onchange = (e) => {
                state.theme = e.target.value;
                localStorage.setItem('duallumi_theme', state.theme);
                updateUI();
                AudioFX.playClick();
            };
        }

        // Sound toggle
        const btnSound = document.getElementById('btnToggleSound');
        if (btnSound) {
            btnSound.onclick = () => {
                state.soundEnabled = !state.soundEnabled;
                localStorage.setItem('duallumi_sound', state.soundEnabled);
                document.getElementById('soundIcon').textContent = state.soundEnabled ? '🔊' : '🔇';
                showToast(state.soundEnabled ? 'Sound FX Enabled' : 'Sound FX Disabled');
            };
        }

        // Mode Toggles
        const btnSync = document.getElementById('btnSyncMode');
        const btnIndep = document.getElementById('btnIndepMode');
        if (btnSync && btnIndep) {
            btnSync.onclick = () => {
                AudioFX.playClick();
                state.syncMode = true;
                state.colorTarget = 'all';
                document.querySelectorAll('.target-pill').forEach(p => p.classList.remove('active'));
                document.getElementById('targetAll').classList.add('active');
                sendApiHttp('sync_mode', { sync_mode: true });
                updateUI();
                showToast('Unified Sync Mode Enabled ⚡');
            };
            btnIndep.onclick = () => {
                AudioFX.playClick();
                state.syncMode = false;
                sendApiHttp('sync_mode', { sync_mode: false });
                updateUI();
                showToast('Independent Mode Enabled 🎛️');
            };
        }

        // Target Pills (Independent mode)
        document.querySelectorAll('.target-pill').forEach(pill => {
            pill.onclick = () => {
                AudioFX.playClick();
                document.querySelectorAll('.target-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                if (pill.id === 'targetStrip') state.colorTarget = 'strip';
                else if (pill.id === 'targetBulb') state.colorTarget = 'bulb';
                else state.colorTarget = 'all';
                showToast(`Target set to: ${pill.textContent}`);
            };
        });

        // Master Power
        const masterSwitch = document.getElementById('masterPowerSwitch');
        if (masterSwitch) {
            masterSwitch.onchange = () => {
                const power = masterSwitch.checked;
                AudioFX[power ? 'playPowerOn' : 'playPowerOff']();
                sendApiHttp('power', { power: power, target: 'all' });
                state.strip.power = power;
                state.bulb.power = power;
                updateUI();
                showToast(power ? 'Master Power ON 💡' : 'Master Power OFF 🌙');
            };
        }

        // Individual Strip & Bulb Power
        const pStrip = document.getElementById('powerStrip');
        if (pStrip) {
            pStrip.onchange = () => {
                const power = pStrip.checked;
                AudioFX[power ? 'playPowerOn' : 'playPowerOff']();
                sendApiHttp('power', { power: power, target: 'strip' });
                state.strip.power = power;
                updateUI();
            };
        }

        const pBulb = document.getElementById('powerBulb');
        if (pBulb) {
            pBulb.onchange = () => {
                const power = pBulb.checked;
                AudioFX[power ? 'playPowerOn' : 'playPowerOff']();
                sendApiHttp('power', { power: power, target: 'bulb' });
                state.bulb.power = power;
                updateUI();
            };
        }

        // Individual Brightness Sliders
        const bStrip = document.getElementById('sliderBrightnessStrip');
        if (bStrip) {
            bStrip.oninput = (e) => {
                const b = parseInt(e.target.value);
                document.getElementById('valBrightnessStrip').textContent = b + '%';
                throttledSend('brightness', { brightness: b, target: 'strip' }, 20);
            };
        }

        const bBulb = document.getElementById('sliderBrightnessBulb');
        if (bBulb) {
            bBulb.oninput = (e) => {
                const b = parseInt(e.target.value);
                document.getElementById('valBrightnessBulb').textContent = b + '%';
                throttledSend('brightness', { brightness: b, target: 'bulb' }, 20);
            };
        }

        // Master Hero Brightness Slider
        const heroB = document.getElementById('heroBrightnessSlider');
        if (heroB) {
            heroB.oninput = (e) => {
                const b = parseInt(e.target.value);
                document.getElementById('valHeroBrightness').textContent = b + '%';
                throttledSend('brightness', { brightness: b, target: 'all' }, 20);
            };
        }

        // Brightness Preset Chips
        document.querySelectorAll('.b-preset-chip').forEach(chip => {
            chip.onclick = () => {
                AudioFX.playClick();
                document.querySelectorAll('.b-preset-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const b = parseInt(chip.dataset.b);
                heroB.value = b;
                document.getElementById('valHeroBrightness').textContent = b + '%';
                sendApiHttp('brightness', { brightness: b, target: 'all' });
                showToast(`Brightness set to ${b}%`);
            };
        });

        // Color Temperature (Kelvin) Slider
        const kelvinSlider = document.getElementById('kelvinSlider');
        if (kelvinSlider) {
            kelvinSlider.oninput = (e) => {
                const k = parseInt(e.target.value);
                document.getElementById('valKelvin').textContent = `${k}K`;
                throttledSend('color_temp', { kelvin: k, target: 'all' }, 25);
            };
        }

        // Kelvin Preset Chips
        document.querySelectorAll('.k-preset-chip').forEach(chip => {
            chip.onclick = () => {
                AudioFX.playClick();
                document.querySelectorAll('.k-preset-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const k = parseInt(chip.dataset.k);
                kelvinSlider.value = k;
                document.getElementById('valKelvin').textContent = `${k}K`;
                sendApiHttp('color_temp', { kelvin: k, target: 'all' });
                showToast(`White Temperature: ${k}K`);
            };
        });

        // Color Order Selects
        const calStrip = document.getElementById('calibStrip');
        if (calStrip) {
            calStrip.onchange = () => {
                sendApiHttp('calibration', { target: 'strip', color_order: calStrip.value });
                showToast(`Strip calibrated to ${calStrip.value}`);
            };
        }
        const calBulb = document.getElementById('calibBulb');
        if (calBulb) {
            calBulb.onchange = () => {
                sendApiHttp('calibration', { target: 'bulb', color_order: calBulb.value });
                showToast(`Bulb calibrated to ${calBulb.value}`);
            };
        }

        // Connect / Disconnect Buttons on Device Cards
        const btnConStrip = document.getElementById('btnConnectStrip');
        if (btnConStrip) {
            btnConStrip.onclick = async () => {
                AudioFX.playClick();
                if (state.strip.connected) {
                    await sendApiHttp('disconnect', { target: 'strip' });
                } else {
                    await sendApiHttp('connect', { target: 'strip' });
                }
                fetchStatus();
            };
        }

        const btnConBulb = document.getElementById('btnConnectBulb');
        if (btnConBulb) {
            btnConBulb.onclick = async () => {
                AudioFX.playClick();
                if (state.bulb.connected) {
                    await sendApiHttp('disconnect', { target: 'bulb' });
                } else {
                    await sendApiHttp('connect', { target: 'bulb' });
                }
                fetchStatus();
            };
        }

        // Hex Input
        const hexInp = document.getElementById('hexColorInput');
        if (hexInp) {
            hexInp.onchange = () => {
                applyHexColor(hexInp.value);
            };
        }

        // Native EyeDropper API
        const btnEye = document.getElementById('btnEyeDropper');
        if (btnEye) {
            btnEye.onclick = async () => {
                if ('EyeDropper' in window) {
                    try {
                        const dropper = new window.EyeDropper();
                        const result = await dropper.open();
                        if (result && result.sRGBHex) {
                            AudioFX.playClick();
                            applyHexColor(result.sRGBHex);
                            showToast(`Sampled color: ${result.sRGBHex}`, 'success');
                        }
                    } catch(e) {}
                } else {
                    showToast('EyeDropper is supported in Chrome & Edge desktop.', 'info');
                }
            };
        }

        // Entertainment Reactive Buttons
        const btnMus = document.getElementById('btnToggleMusic');
        if (btnMus) btnMus.onclick = toggleMusicMode;

        const btnScr = document.getElementById('btnToggleScreenSync');
        if (btnScr) btnScr.onclick = toggleScreenSync;

        // Music Chips
        document.querySelectorAll('.m-chip').forEach(chip => {
            chip.onclick = () => {
                AudioFX.playClick();
                document.querySelectorAll('.m-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.musicAmbiance = chip.dataset.mode;
                showToast(`Music Mode: ${chip.textContent}`);
            };
        });

        const sliderSens = document.getElementById('sliderSensitivity');
        if (sliderSens) {
            sliderSens.oninput = (e) => {
                state.musicSensitivity = parseInt(e.target.value);
                document.getElementById('valSensitivity').textContent = state.musicSensitivity + '%';
            };
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    if (masterSwitch) {
                        masterSwitch.checked = !masterSwitch.checked;
                        masterSwitch.onchange();
                    }
                    break;
                case 'arrowup':
                    e.preventDefault();
                    if (heroB) {
                        heroB.value = Math.min(100, parseInt(heroB.value) + 5);
                        heroB.oninput({ target: heroB });
                    }
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    if (heroB) {
                        heroB.value = Math.max(1, parseInt(heroB.value) - 5);
                        heroB.oninput({ target: heroB });
                    }
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMusicMode();
                    break;
                case 's':
                    e.preventDefault();
                    if (btnSync) btnSync.click();
                    break;
                case '1': case '2': case '3': case '4': case '5': case '6':
                    const idx = parseInt(e.key) - 1;
                    if (PRESET_SCENES[idx]) {
                        const sc = PRESET_SCENES[idx];
                        sendApiHttp('color', { r: sc.r, g: sc.g, b: sc.b, target: 'all' });
                        sendApiHttp('brightness', { brightness: sc.bVal, target: 'all' });
                        showToast(`Applied: ${sc.name}`);
                    }
                    break;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DESKTOP TITLEBAR & IPC INTEGRATION
    // ═══════════════════════════════════════════════════════════════════════

    function initDesktopIntegration() {
        if (window.desktopAPI) {
            document.body.classList.add('is-desktop-app');

            const btnMini = document.getElementById('tbMiniHud');
            const btnMin = document.getElementById('tbMinimize');
            const btnMax = document.getElementById('tbMaximize');
            const btnClose = document.getElementById('tbClose');

            if (btnMini) btnMini.addEventListener('click', () => window.desktopAPI.toggleMiniHUD());
            if (btnMin) btnMin.addEventListener('click', () => window.desktopAPI.minimize());
            if (btnMax) btnMax.addEventListener('click', () => window.desktopAPI.toggleMaximize());
            if (btnClose) btnClose.addEventListener('click', () => window.desktopAPI.close());

            window.desktopAPI.onHotkeyPressed((data) => {
                showToast(`${data.title}: ${data.message}`, 'info');
                fetchStatus();
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INITIALIZATION ON DOM READY
    // ═══════════════════════════════════════════════════════════════════════

    window.addEventListener('DOMContentLoaded', () => {
        console.log('DualLumi PRO v3.0 Initializing...');

        // Initialize core features
        initEventListeners();
        initDesktopIntegration();
        initColorWheel();
        initQuickColors();
        renderColorHistory();
        renderPresetScenes();
        initCustomScenes();
        renderColorPalettes();
        initPhotoExtraction();
        initEffectsStudio();
        initCircadianMode();
        initSchedules();
        initScanner();
        initVoiceControl();
        initSettings();

        // Connect WebSocket and fetch initial hardware status
        connectWebSocket();
        fetchStatus();

        // Polling fallback every 4s
        setInterval(fetchStatus, 4000);

        updateUI();
        console.log('DualLumi PRO v3.0 Initialized successfully!');
    });

})();
