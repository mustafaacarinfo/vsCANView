import { ctx2d, clamp } from '../core/chartCore.js';
export class ArcGauge {
  constructor(canvas, {
    min=0, 
    max=100, 
    value=0, 
    unit='%', 
    bands=[
      {t:0.33, col:'#ef4444', gradient:'#ef4444,#f87171'},
      {t:0.66, col:'#f59e0b', gradient:'#f59e0b,#fbbf24'}, 
      {t:1, col:'#34d399', gradient:'#34d399,#6ee7b7'}
    ], 
    label='', 
    icon=null,
    showNeedle=true
  } = {}){
    this.c=canvas; 
    this.ctx=ctx2d(canvas);
    this.min=min; 
    this.max=max; 
    this.value=value; 
    this.unit=unit; 
    this.bands=bands; 
    this.label=label;
    this.icon=icon;
    this.showNeedle=showNeedle;
    this.animation = {
      current: value,
      target: value,
      step: 0,
      timestamp: 0
    };
    window.addEventListener('resize', () => this.ctx=ctx2d(this.c));
  }
  
  setValue(v){ 
    // Animasyon için hazırlık
    this.animation.current = this.value;
    this.animation.target = v;
    this.animation.step = (v - this.value) / 10;  // 10 adımda tamamla
    this.animation.timestamp = performance.now();
    
    this.value = v; 
    this.animateDraw(); 
  }
  
  // Animasyonlu çizim
  animateDraw() {
    if (Math.abs(this.animation.current - this.animation.target) > 0.1) {
      // Animasyon devam ediyor
      this.animation.current += this.animation.step;
      if ((this.animation.step > 0 && this.animation.current > this.animation.target) || 
          (this.animation.step < 0 && this.animation.current < this.animation.target)) {
        this.animation.current = this.animation.target;
      }
      
      this.draw(this.animation.current);
      requestAnimationFrame(() => this.animateDraw());
    } else {
      // Animasyon tamamlandı
      this.animation.current = this.animation.target;
      this.draw(this.animation.target);
    }
  }
  
  createGradient(ctx, cx, cy, R, start, end, colors) {
    const colorStops = colors.split(',');
    const gradient = ctx.createLinearGradient(
      cx + Math.cos(start) * R, cy + Math.sin(start) * R,
      cx + Math.cos(end) * R, cy + Math.sin(end) * R
    );
    
    // Gradyanlara düzgün renk atama
    if (colorStops.length > 1) {
      gradient.addColorStop(0, colorStops[0]);
      gradient.addColorStop(1, colorStops[1]);
    } else {
      gradient.addColorStop(0, colorStops[0]);
      gradient.addColorStop(1, colorStops[0]);
    }
    
    return gradient;
  }
  
  // Değer göstergesini çiz (ibre veya dolum)
  drawValueIndicator(ctx, cx, cy, R, start, end, frac, color) {
    // Değeri ark olarak çiz
    ctx.lineWidth = 18; 
    ctx.lineCap = 'round';
    
    // Tam arklı gösterge
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, start + (end-start) * frac);
    ctx.stroke();
    
    // İbre gösterimi aktifse
    if (this.showNeedle) {
      // İbre çiz
      const angle = start + (end-start) * frac;
      const needleLen = R - 15;
      const needleWidth = 3;
      
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      
      // İbre gölgesi
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      // İbre
      ctx.lineWidth = needleWidth;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(needleLen, 0);
      ctx.stroke();
      
      // İbre orta noktası
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      
      ctx.restore();
    }
  }
  
  draw(displayValue = null){
    if (displayValue === null) displayValue = this.value;
    
    this.ctx = ctx2d(this.c); 
    const ctx = this.ctx; 
    const r = this.c.getBoundingClientRect(); 
    const W = r.width, H = r.height;
    const cx = W/2, cy = H*0.72;  // Merkez konumu düzeltildi
    const R = Math.min(W, H*1.3)/2 - 15; 
    const start = Math.PI * 1.2, end = Math.PI * -0.2;  // Ark açısı genişletildi
    
    ctx.clearRect(0, 0, W, H);
    
    // Arka plan çizgileri
    ctx.lineCap = 'round'; 
    ctx.lineWidth = 18;  // Daha kalın
    
    // Ölçek çizgileri (ticks)
    const tickCount = 8;  // Ölçek çizgileri
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    
    for (let i = 0; i <= tickCount; i++) {
      const angle = start + (end - start) * i / tickCount;
      const tickLength = i % 2 === 0 ? 10 : 5;
      
      ctx.beginPath();
      ctx.moveTo(
        cx + Math.cos(angle) * (R - 25),
        cy + Math.sin(angle) * (R - 25)
      );
      ctx.lineTo(
        cx + Math.cos(angle) * (R - 25 + tickLength),
        cy + Math.sin(angle) * (R - 25 + tickLength)
      );
      ctx.stroke();
      
      // Ana ölçeklerde değerleri göster
      if (i % 2 === 0) {
        const value = this.min + (this.max - this.min) * i / tickCount;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          Math.round(value),
          cx + Math.cos(angle) * (R - 40),
          cy + Math.sin(angle) * (R - 40)
        );
      }
    }
    
    // Arka plan arkı
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#1f2937';
    ctx.beginPath(); 
    ctx.arc(cx, cy, R, start, end); 
    ctx.stroke();
    
    // Gradient için renk
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    
    // Renkli bantlar (güvenli/orta/yüksek)
    let prev = 0;
    const bands = this.bands;
    
    // Sınır çizgileri (opsiyonel)
    for (const b of bands) {
      const bandFrac = start + (end-start) * b.t;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(bandFrac) * (R),
        cy + Math.sin(bandFrac) * (R),
        2, 0, Math.PI * 2
      );
      ctx.fill();
    }
    
    // Renkli bantlar
    for (const b of bands) {
      const gradient = this.createGradient(
        ctx, cx, cy, R, 
        start + (end-start) * prev,
        start + (end-start) * b.t,
        b.gradient || b.col
      );
      
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, R, start + (end-start) * prev, start + (end-start) * b.t);
      ctx.stroke();
      prev = b.t;
    }
    
    // Değer göstergesi
    const frac = clamp((displayValue - this.min)/(this.max - this.min || 1), 0, 1);
    
    // Değer göstergesi
    this.drawValueIndicator(ctx, cx, cy, R, start, end, frac, '#60a5fa');
    
    // Değer metni
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '28px ui-sans-serif';
    ctx.fontWeight = '700';
    ctx.textBaseline = 'bottom';
    
    // Değer ve etiket görsel konumu
    const valueY = cy + 40;
    ctx.fillText(Math.round(displayValue) + this.unit, cx, valueY);
    
    // Alt etiket
    if (this.label) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '14px ui-sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(this.label, cx, valueY + 5);
    }
    
    // İkon ekle
    if (this.icon) {
      const iconSize = 24;
      const iconX = cx - iconSize / 2;
      const iconY = valueY + 20;
      
      ctx.drawImage(this.icon, iconX, iconY, iconSize, iconSize);
    }
  }
}

export class FuelGauge extends ArcGauge { 
  constructor(c) { 
    // Yakıt göstergesi için özel bant yapılandırması
    super(c, {
      min: 0,
      max: 100,
      value: 51,
      unit: '%',
      label: 'Yakıt Seviyesi',
      bands: [
        {t: 0.25, col: '#ef4444', gradient: '#ef4444,#f87171'}, // Kırmızı - düşük
        {t: 0.5, col: '#f59e0b', gradient: '#f59e0b,#fbbf24'},  // Turuncu - orta
        {t: 1, col: '#10b981', gradient: '#10b981,#34d399'}     // Yeşil - yüksek
      ],
      showNeedle: true
    }); 
  } 
}
