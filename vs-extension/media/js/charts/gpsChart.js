import { ctx2d } from '../core/chartCore.js';

export class GpsChart {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = ctx2d(canvas);
    this.points = [];
    this.center = { lat: 39.9334, lon: 32.8597 }; // Ankara
    this.zoom = 12;
  }
  
  setPoints(pts) {
    this.points = pts;
  }
  
  clearData() {
    this.points = [];
    this.draw();
  }
  
  draw() {
    this.ctx = ctx2d(this.c);
    const ctx = this.ctx;
    const r = this.c.getBoundingClientRect();
    const W = r.width;
    const H = r.height;
    
    ctx.clearRect(0, 0, W, H);
    
    // Draw background
    ctx.fillStyle = '#1a1f2e';
    ctx.fillRect(0, 0, W, H);
    
    // Draw grid
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const x = (i / 10) * W;
      const y = (i / 10) * H;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    
    // Draw points if any
    if (this.points && this.points.length > 0) {
      ctx.fillStyle = '#60a5fa';
      for (const point of this.points) {
        // Simple projection for demo
        const x = W * 0.5 + (point.lon - this.center.lon) * 1000;
        const y = H * 0.5 - (point.lat - this.center.lat) * 1000;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Draw center marker
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(W/2, H/2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  static randomRoute(n = 60) {
    let la = 41.01, lo = 28.97;
    const out = [];
    for (let i = 0; i < n; i++) {
      lo += (Math.random() * 2 - 1) * 0.02;
      la += (Math.random() * 2 - 1) * 0.01;
      out.push({ lat: la, lon: lo });
    }
    return out;
  }
}
