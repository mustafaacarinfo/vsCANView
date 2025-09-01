import { ctx2d, clamp } from '../core/chartCore.js';

// Yeni API: thresholds / colorStops desteği, eski bands ile geriye uyum
export class ArcGauge {
  constructor(canvas, opts = {}) {
    const {
      min = 0,
      max = 100,
      value = null,
      unit = '%',
      thresholds = null,     // { cold:40, normal:90, hot:100 }
      colorStops = null,      // [{ color:'#3b82f6', upTo:40 }, ...]
      bands = null,           // eski API (t: 0..1)
      label = '',
      icon = null,
  showNeedle = true,
  showValue = true,
  zeroNoFill = false,       // min < 0 iken value=0 durumunda segment boyama (opsiyonel)
  neutralBelowOrEq = null,  // Bu eşik ve altındaki değerler için pointer rengi sabit (mavi)
  showZeroTick = false      // Ölçekte 0 etiketi zorla göster
    } = opts;
    this.c = canvas; this.ctx = ctx2d(canvas);
    this.min = min; this.max = max; this.value = value; this.unit = unit;
  this.label = label; this.icon = icon; this.showNeedle = showNeedle; this.showValue = showValue;
  this.zeroNoFill = zeroNoFill;
  this.neutralBelowOrEq = neutralBelowOrEq;
  this.showZeroTick = showZeroTick;
  this.segments = this._buildSegments({ thresholds, colorStops, bands, min, max });
    this.animation = { current: value, target: value, step: 0, timestamp: 0 };
    window.addEventListener('resize', () => this.ctx = ctx2d(this.c));
    
    // Initial draw with the constructor value
    if (this.c) {
      setTimeout(() => this.draw(), 0);
    }
  }

  _buildSegments({ thresholds, colorStops, bands, min, max }) {
    let segs = [];
    if (thresholds && typeof thresholds === 'object') {
      const cold = thresholds.cold ?? (min + (max - min) * 0.25);
      const normal = thresholds.normal ?? (min + (max - min) * 0.6);
      const hot = thresholds.hot ?? (min + (max - min) * 0.85);
      segs = [
        { end: cold, color: '#3b82f6' },   // mavi
        { end: normal, color: '#10b981' }, // yeşil
        { end: hot, color: '#f59e0b' },    // turuncu
        { end: max, color: '#ef4444' }     // kırmızı
      ];
    } else if (Array.isArray(colorStops)) {
      segs = colorStops.map(cs => ({ end: cs.upTo, color: cs.color }));
      if (segs[segs.length - 1].end < max) segs.push({ end: max, color: segs[segs.length - 1].color });
    } else if (Array.isArray(bands)) { // geriye uyum
      segs = bands.map(b => ({ end: min + (max - min) * b.t, color: b.col || '#60a5fa' }));
      if (!segs.length || segs[segs.length - 1].end < max) segs.push({ end: max, color: (segs[segs.length - 1] || {}).color || '#60a5fa' });
    } else {
      segs = [
        { end: min + (max - min) * 0.33, color: '#3b82f6' },
        { end: min + (max - min) * 0.66, color: '#10b981' },
        { end: max, color: '#f59e0b' }
      ];
    }
    segs.sort((a, b) => a.end - b.end);
    return segs;
  }
  
  setValue(v) {
    // null veya undefined verilirse gauge "boş / saydam" moda geçer
    if(v === null || v === undefined){
      this.value = null;
      this.draw(null);
      return;
    }
  // Eğer geçici noFillAfterClear aktif ise ve gelen değer 0'dan farklı ise kapat
    if(this._tempZeroNoFill){
      // İlk gerçek veri fark etmeksizin (0 veya başka) normal moda dön
      this.zeroNoFill = false;
      this._tempZeroNoFill = false;
    }
    this.animation.current = (this.value==null)? v : this.value;
    this.animation.target = v;
    this.animation.step = (v - this.animation.current) / 10;
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
  
  // Yalnızca ibre (value arc segmentler tarafından dolduruluyor)
  _drawNeedle(ctx, cx, cy, R, start, end, frac, color) {
    if (!this.showNeedle) return;
    const angle = start + (end - start) * frac;
    const needleLen = R - 15;
    const needleWidth = 3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.lineWidth = needleWidth;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(needleLen, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  
  draw(displayValue = null) {
    if (displayValue === null) displayValue = this.value;
    this.ctx = ctx2d(this.c);
    const ctx = this.ctx;
    const r = this.c.getBoundingClientRect();
    const W = r.width, H = r.height;
    const cx = W / 2, cy = H * 0.72;
  const Rraw = Math.min(W, H * 1.3) / 2 - 15;
  const R = Math.max(30, Rraw); // negatif / çok küçük yarıçapı engelle
    const start = Math.PI * 1.2, end = Math.PI * -0.2;
    ctx.clearRect(0, 0, W, H);

    // Ölçek çizgileri
    const tickCount = 8;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    const middleIndex = Math.floor(tickCount / 2);
    for (let i = 0; i <= tickCount; i++) {
      const angle = start + (end - start) * i / tickCount;
      const tickLength = i % 2 === 0 ? 10 : 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * (R - 25), cy + Math.sin(angle) * (R - 25));
      ctx.lineTo(cx + Math.cos(angle) * (R - 25 + tickLength), cy + Math.sin(angle) * (R - 25 + tickLength));
      ctx.stroke();
      if (i % 2 === 0) {
        if (i === middleIndex) continue; // orta etiketi gösterme (değer metni ile çakışıyor)
        const value = this.min + (this.max - this.min) * i / tickCount;
        if(this.showZeroTick && Math.abs(value) < 1e-6) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '10px "Inter","Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('0', cx + Math.cos(angle) * (R - 38), cy + Math.sin(angle) * (R - 38));
          continue;
        }
        ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.font = '10px "Inter","Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center';
        // Etiketleri biraz daha dışa taşı (R - 46 yerine R - 38 gibi ayarlandı)
        ctx.fillText(Math.round(value), cx + Math.cos(angle) * (R - 38), cy + Math.sin(angle) * (R - 38));
      }
    }
    // 0 etiketi tick aralığına düşmüyorsa ayrıca çiz
    let zeroGeom = null;
    if(this.showZeroTick && this.min < 0 && this.max > 0){
      const zeroFrac = (0 - this.min)/(this.max - this.min || 1);
      const zAngle = start + (end - start) * zeroFrac;
      // Zero tick (daha uzun ve farklı renk)
      const baseInner = R - 25;
      const tickLen = 14; // daha uzun
      ctx.save();
      ctx.strokeStyle = 'rgba(132,199,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(zAngle) * baseInner, cy + Math.sin(zAngle) * baseInner);
      ctx.lineTo(cx + Math.cos(zAngle) * (baseInner + tickLen), cy + Math.sin(zAngle) * (baseInner + tickLen));
      ctx.stroke();
      ctx.restore();
      // Label yarıçapını biraz daha dışa al ve hafif döndürme offset (okunabilirlik)
      const labelRadius = R - 32; // önceki -38 yerine
      const zx = cx + Math.cos(zAngle) * labelRadius;
      const zy = cy + Math.sin(zAngle) * labelRadius;
      ctx.fillStyle = 'rgba(180,220,255,0.85)';
      ctx.font = '11px "Inter","Segoe UI",system-ui,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('0', zx, zy);
      zeroGeom = { angle:zAngle, x:zx, y:zy };
    }

  // Track (boş modda daha soluk)
  ctx.lineWidth = 18; ctx.lineCap = 'round';
  const empty = (displayValue == null);
  ctx.strokeStyle = empty ? 'rgba(24,32,44,0.35)' : '#18202c';
  ctx.beginPath(); ctx.arc(cx, cy, R, start, end); ctx.stroke();

    // Her durumda (zeroNoFill olsa bile) ibre konumu için fracValue hesapla
    let fracVal = 0;
    if(!empty){
      fracVal = clamp((displayValue - this.min) / (this.max - this.min || 1), 0, 1);
      // zeroNoFill aktif ve 0 değerindeysek sadece segment boyamasını atla
      if(!(this.zeroNoFill && this.min < 0 && displayValue === 0)){
        const valueLimit = this.min + (this.max - this.min) * fracVal;
        let segStartValue = this.min;
        ctx.lineWidth = 18;
        for (const seg of this.segments) {
          const segEndValue = Math.min(seg.end, valueLimit);
          if (segEndValue <= segStartValue) { segStartValue = seg.end; continue; }
          const a0 = start + (end - start) * ((segStartValue - this.min) / (this.max - this.min));
          const a1 = start + (end - start) * ((segEndValue - this.min) / (this.max - this.min));
          ctx.strokeStyle = seg.color;
          ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
          segStartValue = seg.end;
          if (seg.end >= valueLimit) break;
        }
      }
    }

    // İbre / pointer - her zaman çiz, veri yoksa gri
    let pointerColor = '#60a5fa';
    if(!empty){
      for (const seg of this.segments) { if (displayValue <= seg.end) { pointerColor = seg.color; break; } }
      if(this.neutralBelowOrEq != null && displayValue <= this.neutralBelowOrEq){ pointerColor = '#3b82f6'; }
    } else {
      // Veri yokken gri ibre
      pointerColor = 'rgba(96, 165, 250, 0.3)';
      fracVal = 0; // İbreyi minimum konuma koy
    }
    this._drawNeedle(ctx, cx, cy, R, start, end, fracVal, pointerColor);

  if (this.showValue) {
      // Değer metni
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '28px "Inter","Segoe UI",system-ui,sans-serif'; ctx.textBaseline = 'bottom';
      const valueY = cy + Math.min(44, H * 0.30); // bir miktar daha aşağı
  const labelVal = empty ? '' : (Math.round(displayValue) + this.unit);
  ctx.fillText(labelVal, cx, valueY);
      if (this.label) {
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '13px "Inter","Segoe UI",system-ui,sans-serif'; ctx.textBaseline = 'top';
        ctx.fillText(this.label, cx, valueY + 8);
      }
      if (this.icon) {
        const iconSize = 24; ctx.drawImage(this.icon, cx - iconSize / 2, valueY + 20, iconSize, iconSize);
      }
    }
  }
}

export class FuelGauge extends ArcGauge {
  constructor(c) {
  super(c, { min:0, max:100, value:0, unit:'%', label:'', showNeedle:true, showValue:true });
  }

  draw(displayValue = null){
    if (displayValue === null) displayValue = this.value;
    this.ctx = ctx2d(this.c);
    const ctx = this.ctx;
    const r = this.c.getBoundingClientRect();
    const W = r.width, H = r.height;
    // --- YENİ ÖLÇEK & YERLEŞİM ---
    // Daha küçük / görünür yarıçap ve üstte geniş 210° yay (otomotiv tarzı, altı açık)
  const cx = W/2;
  // Dinamik padding
  const pad = Math.max(6, Math.min(20, Math.min(W,H)*0.035));
  const startDeg = 165;          // simetri için merkez üst -90° etrafında
  const sweepDeg = 210;          // daha geniş ama dengeli yay
  // Yükseklik kısıtı: alt sınır = cy + 0.643R, üst sınır = cy - R ~ 10
  // R <= (H - pad - 10)/1.643, ayrıca yanlarda R <= (W/2 - pad)
  const Rw = (W/2 - pad);
  const Rh = (H - pad - 10) / 1.58; // daha az kısıt -> biraz daha büyük R
  const R = Math.max(40, Math.min(Rw, Rh));
  const cy = R + 10;             // üstte 10px boşluk
  // Track kalınlığı oransal
  const trackWidth = Math.max(10, Math.min(26, R * 0.12));
  const start = startDeg * Math.PI/180;
  const endRaw = (startDeg + sweepDeg) * Math.PI/180;
  const end = endRaw - 2*Math.PI; // canvas arc yönü için (start > end) kullanıyoruz
  const sweep = sweepDeg * Math.PI/180; // direkt
    ctx.clearRect(0,0,W,H);

    // Arka track
    ctx.lineWidth = trackWidth; ctx.lineCap='round';
    ctx.strokeStyle='#24303a';
    ctx.beginPath(); ctx.arc(cx,cy,R,start,end,false); ctx.stroke();

    const val = clamp(displayValue,0,100);

    // Segment tanımı (E->F) & sadece değere kadar boya
    const segments = [
      {from:0, to:10, col:'#d32f2f'},
      {from:10, to:25, col:'#f57c00'},
      {from:25, to:50, col:'#fbc02d'},
      {from:50, to:100, col:'#43a047'}
    ];
    ctx.lineWidth = trackWidth;
    segments.forEach(s => {
      if (val <= s.from) return;            // henüz başlamadı
      const segEnd = Math.min(val, s.to);
      const f0 = s.from/100, f1 = segEnd/100;
      const a0 = start + sweep * f0;
      const a1 = start + sweep * f1;
      ctx.strokeStyle = s.col;
      ctx.beginPath(); ctx.arc(cx,cy,R,a0,a1,false); ctx.stroke();
    });

    // Gösterilecek aktif renk (val hangi segmentte?)
    let activeColor = '#43a047';
    for (const s of segments){ if (val <= s.to){ activeColor = s.col; break; } }

    // İbre (segmentlerden SONRA çiz ki üstte kalsın)
    const angle = start + sweep * (val/100);
  const needleLen = R - trackWidth - 6;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
    ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowBlur=4; ctx.shadowOffsetX=2; ctx.shadowOffsetY=2;
    // Gövde
    ctx.lineCap='round';
    ctx.lineWidth=5; ctx.strokeStyle='#ffffff';
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(needleLen,0); ctx.stroke();
    // İnce üst highlight (segment rengine yaklaşan degrade)
    ctx.lineWidth=2; const grad=ctx.createLinearGradient(0,0,needleLen,0);
    grad.addColorStop(0,'#ffffff'); grad.addColorStop(1, activeColor);
    ctx.strokeStyle=grad; ctx.beginPath(); ctx.moveTo(-2,0); ctx.lineTo(needleLen,0); ctx.stroke();
    // Pivot
    ctx.shadowColor='transparent';
    ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fillStyle='#1e2732'; ctx.fill(); ctx.strokeStyle='#555'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fillStyle=activeColor; ctx.fill();
    ctx.restore();

    // Major & minor tick'ler (0,25,50,75,100 ve ara)
    const majors=[0,25,50,75,100];
    const minors=[12.5,37.5,62.5,87.5];
  const tickInner = R - trackWidth - Math.min(10, R*0.08);
    // Minor
    ctx.lineCap='butt'; ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=2;
    minors.forEach(p => {
      const a = start + sweep*(p/100);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a)*tickInner, cy + Math.sin(a)*tickInner);
      ctx.lineTo(cx + Math.cos(a)*(tickInner+6), cy + Math.sin(a)*(tickInner+6));
      ctx.stroke();
    });
    // Major
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=3;
    majors.forEach(p => {
      const a = start + sweep*(p/100);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a)*(tickInner-6), cy + Math.sin(a)*(tickInner-6));
      ctx.lineTo(cx + Math.cos(a)*(tickInner+10), cy + Math.sin(a)*(tickInner+10));
      ctx.stroke();
    });

    // Etiketler (E, 1/2, F) – üstte sıkışmaması için yarıçap ayarı
  ctx.fillStyle='#ffffff'; ctx.font='14px "Inter","Segoe UI",system-ui,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const labelRadius = R - trackWidth - Math.max(26, R*0.28);
    const labels = [{p:0,t:'E'},{p:50,t:'1/2'},{p:100,t:'F'}].map(l => {
      const a = start + sweep*(l.p/100);
      return { ...l, a, x: cx + Math.cos(a)*labelRadius, y: cy + Math.sin(a)*labelRadius };
    });
    // E ve F hizalama: ortalama y
    const e = labels.find(l=>l.t==='E');
    const f = labels.find(l=>l.t==='F');
    if (e && f){
      const alignY = (e.y + f.y)/2;
      e.y = f.y = alignY; // aynı hizaya
    }
    labels.forEach(l => {
      let ty = l.y;
      if (l.t==='1/2') ty -= Math.max(4, R*0.05); // yarım etiketi biraz yukarı
      ctx.fillText(l.t, l.x, ty);
    });

    // Yüzde yazısı – pivotun biraz altında ama ezilmeden
  ctx.font='15px "Inter","Segoe UI",system-ui,sans-serif'; ctx.fillStyle=activeColor; ctx.textBaseline='top'; ctx.textAlign='center';
  ctx.fillText(Math.round(val)+'%', cx, cy + Math.min(18, R*0.18));

    // Yakıt ikonu – yay orta üst bölgesine
  // Yakıt ikonu: yüzde metninin biraz sağına (alt merkez)
  const percentYOffset = Math.min(18, R*0.18);
  // İkonu daha sağ ve biraz aşağı (sağ-alt) kaydır
  const ix = cx + Math.min(50, R*0.34);
  const iy = cy + percentYOffset + Math.min(10, R*0.10);
  ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.4; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath();
  ctx.rect(ix-6,iy-9,12,16);
  ctx.moveTo(ix+6, iy-5); ctx.lineTo(ix+9, iy-1); ctx.lineTo(ix+6, iy-1);
  ctx.moveTo(ix+9, iy+2); ctx.lineTo(ix+9, iy+6);
  ctx.moveTo(ix-2, iy+6); ctx.lineTo(ix-2, iy+10);
  ctx.stroke();
  }
}
