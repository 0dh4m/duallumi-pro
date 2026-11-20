// DualLumi Virtual Room Visualizer
// Real-time canvas lighting simulation for LED Strip & Smart Bulb

class RoomVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    this.stripColor = { r: 255, g: 85, b: 0, power: true, brightness: 100 };
    this.bulbColor = { r: 0, g: 240, b: 255, power: true, brightness: 100 };
    this.animTime = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  resize() {
    this.width = this.canvas.clientWidth || 400;
    this.height = this.canvas.clientHeight || 240;
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  update(strip, bulb) {
    if (strip) {
      this.stripColor = {
        r: strip.r ?? 255,
        g: strip.g ?? 85,
        b: strip.b ?? 0,
        power: strip.power ?? true,
        brightness: strip.brightness ?? 100
      };
    }
    if (bulb) {
      this.bulbColor = {
        r: bulb.r ?? 0,
        g: bulb.g ?? 240,
        b: bulb.b ?? 255,
        power: bulb.power ?? true,
        brightness: bulb.brightness ?? 100
      };
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.animTime += 0.03;
    this.draw();
  }

  draw() {
    const w = this.width;
    const h = this.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // 1. Room Background (Dark Sci-Fi Chamber)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(0.7, '#0f1422');
    bgGrad.addColorStop(1, '#05070c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Floor horizon line
    const floorY = h * 0.72;

    // 2. Bulb Ambient Downward Glow (from ceiling)
    if (this.bulbColor.power) {
      const bBri = this.bulbColor.brightness / 100.0;
      const bAlpha = 0.45 * bBri;
      const bulbX = w * 0.5;
      const bulbY = h * 0.18;

      const bulbGrad = ctx.createRadialGradient(bulbX, bulbY, 5, bulbX, bulbY + 50, w * 0.55);
      bulbGrad.addColorStop(0, `rgba(${this.bulbColor.r}, ${this.bulbColor.g}, ${this.bulbColor.b}, ${bAlpha})`);
      bulbGrad.addColorStop(0.5, `rgba(${this.bulbColor.r}, ${this.bulbColor.g}, ${this.bulbColor.b}, ${bAlpha * 0.3})`);
      bulbGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = bulbGrad;
      ctx.fillRect(0, 0, w, h);

      // Bulb Fixture Cable & Bulb
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bulbX, 0);
      ctx.lineTo(bulbX, bulbY);
      ctx.stroke();

      // Glowing Bulb Glass Sphere
      ctx.fillStyle = `rgb(${this.bulbColor.r}, ${this.bulbColor.g}, ${this.bulbColor.b})`;
      ctx.shadowColor = `rgb(${this.bulbColor.r}, ${this.bulbColor.g}, ${this.bulbColor.b})`;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(bulbX, bulbY + 4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 3. Desk & LED Strip Backlight
    const deskW = w * 0.65;
    const deskH = 14;
    const deskX = (w - deskW) / 2;
    const deskY = floorY - 30;

    // LED Strip Volumetric Glow on the wall behind desk
    if (this.stripColor.power) {
      const sBri = this.stripColor.brightness / 100.0;
      const sAlpha = 0.65 * sBri;

      const stripGrad = ctx.createRadialGradient(
        w * 0.5, deskY - 15,
        10,
        w * 0.5, deskY - 15,
        deskW * 0.75
      );
      stripGrad.addColorStop(0, `rgba(${this.stripColor.r}, ${this.stripColor.g}, ${this.stripColor.b}, ${sAlpha})`);
      stripGrad.addColorStop(0.6, `rgba(${this.stripColor.r}, ${this.stripColor.g}, ${this.stripColor.b}, ${sAlpha * 0.25})`);
      stripGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = stripGrad;
      ctx.fillRect(deskX - 40, deskY - 90, deskW + 80, 110);

      // Direct LED Strip Line (neon core)
      ctx.strokeStyle = `rgb(${this.stripColor.r}, ${this.stripColor.g}, ${this.stripColor.b})`;
      ctx.shadowColor = `rgb(${this.stripColor.r}, ${this.stripColor.g}, ${this.stripColor.b})`;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(deskX + 8, deskY - 2);
      ctx.lineTo(deskX + deskW - 8, deskY - 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4. Ultra-wide Curved Monitor on Desk
    const monW = deskW * 0.55;
    const monH = 55;
    const monX = (w - monW) / 2;
    const monY = deskY - monH - 8;

    // Monitor Stand
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(w * 0.5 - 4, monY + monH, 8, 8);
    ctx.fillRect(w * 0.5 - 20, deskY - 3, 40, 3);

    // Monitor Chassis
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(monX, monY, monW, monH, 4);
    ctx.fill();
    ctx.stroke();

    // Monitor Display Screen (Subtle Cyber Dashboard)
    const scrGrad = ctx.createLinearGradient(monX, monY, monX + monW, monY + monH);
    scrGrad.addColorStop(0, '#0c1a2d');
    scrGrad.addColorStop(0.5, '#07101e');
    scrGrad.addColorStop(1, '#0e2438');
    ctx.fillStyle = scrGrad;
    ctx.fillRect(monX + 3, monY + 3, monW - 6, monH - 6);

    // Screen HUD Lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(monX + 8, monY + 8, monW - 16, monH - 16);

    // 5. Desk Surface
    ctx.fillStyle = '#161e2e';
    ctx.fillRect(deskX, deskY, deskW, deskH);
    ctx.strokeStyle = '#273549';
    ctx.strokeRect(deskX, deskY, deskW, deskH);

    // Desk Legs
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(deskX + 10, deskY + deskH, 6, floorY - (deskY + deskH) + 12);
    ctx.fillRect(deskX + deskW - 16, deskY + deskH, 6, floorY - (deskY + deskH) + 12);

    // Keyboard & Mouse on desk
    ctx.fillStyle = '#334155';
    ctx.fillRect(w * 0.5 - 25, deskY + 2, 50, 6);
    ctx.fillRect(w * 0.5 + 32, deskY + 3, 8, 5);

    // Room Label
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText('LIVE LIGHTING SIMULATION', 12, h - 12);
  }
}

window.RoomVisualizer = RoomVisualizer;

