// DualLumi High-DPI Circular HSV Gamut Wheel
class DualLumiColorWheel {
  constructor(canvasElement, onChangeCallback) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onChange = onChangeCallback;

    this.hue = 20;   // 0 - 360
    this.sat = 0.95; // 0 - 1
    this.val = 1.0;  // 0 - 1
    this.isDragging = false;
    this.cachedImage = null;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Mouse / Touch events
    const onStart = (e) => {
      this.isDragging = true;
      this.handleInput(e);
    };
    const onMove = (e) => {
      if (this.isDragging) this.handleInput(e);
    };
    const onEnd = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e.touches[0]); }, { passive: false });
    window.addEventListener('touchmove', (e) => { if (this.isDragging) { e.preventDefault(); onMove(e.touches[0]); } }, { passive: false });
    window.addEventListener('touchend', onEnd);

    this.draw();
  }

  resize() {
    const size = Math.min(this.canvas.parentElement.clientWidth || 240, 240);
    this.size = size;
    this.canvas.width = size * window.devicePixelRatio;
    this.canvas.height = size * window.devicePixelRatio;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.cachedImage = null;
    this.draw();
  }

  setColor(r, g, b) {
    const hsv = this.rgbToHsv(r, g, b);
    this.hue = hsv.h;
    this.sat = hsv.s;
    this.val = Math.max(0.2, hsv.v);
    this.draw();
  }

  handleInput(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = this.size / 2;
    const cy = this.size / 2;
    const maxR = (this.size / 2) - 10;

    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    this.hue = angle;
    this.sat = Math.min(1.0, Math.max(0.0, dist / maxR));

    this.draw();

    const rgb = this.hsvToRgb(this.hue, this.sat, this.val);
    if (this.onChange) {
      this.onChange(rgb.r, rgb.g, rgb.b);
    }
  }

  draw() {
    const s = this.size;
    const cx = s / 2;
    const cy = s / 2;
    const maxR = cx - 10;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, s, s);

    // Render wheel gradient
    if (!this.cachedImage) {
      const offscreen = document.createElement('canvas');
      offscreen.width = s;
      offscreen.height = s;
      const offCtx = offscreen.getContext('2d');

      const imgData = offCtx.createImageData(s, s);
      const data = imgData.data;

      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);

          if (dist <= maxR) {
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle < 0) angle += 360;

            const sat = dist / maxR;
            const rgb = this.hsvToRgb(angle, sat, 1.0);

            const idx = (y * s + x) * 4;
            data[idx] = rgb.r;
            data[idx + 1] = rgb.g;
            data[idx + 2] = rgb.b;
            // Smooth anti-aliased edge
            data[idx + 3] = dist > maxR - 1 ? Math.round((maxR - dist) * 255) : 255;
          }
        }
      }
      offCtx.putImageData(imgData, 0, 0);
      this.cachedImage = offscreen;
    }

    ctx.drawImage(this.cachedImage, 0, 0);

    // Draw Wheel Outer Ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.stroke();

    // Draw Thumb Reticle
    const rad = this.hue * (Math.PI / 180);
    const rDist = this.sat * maxR;
    const tx = cx + rDist * Math.cos(rad);
    const ty = cy + rDist * Math.sin(rad);

    const currRgb = this.hsvToRgb(this.hue, this.sat, this.val);

    ctx.save();
    ctx.shadowColor = `rgb(${currRgb.r}, ${currRgb.g}, ${currRgb.b})`;
    ctx.shadowBlur = 10;
    ctx.fillStyle = `rgb(${currRgb.r}, ${currRgb.g}, ${currRgb.b})`;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(tx, ty, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;

    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, v };
  }
}

window.DualLumiColorWheel = DualLumiColorWheel;

