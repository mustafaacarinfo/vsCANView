export function ctx2d(canvas){
  // Performans optimizasyonu: piksel oranını sınırla
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // Maksimum 1.5x
  const r = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width  * dpr));
  const H = Math.max(1, Math.round(r.height * dpr));
  if(canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d', { 
    alpha: true, 
    desynchronized: true,
    willReadFrequently: false // Performans artışı
  });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; // Performans için kapatıldı
  ctx.imageSmoothingQuality = 'low'; // Gerekirse düşük kalite
  return ctx;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const now   = () => Date.now() / 1000;
export const rand  = () => (Math.random()+Math.random()+Math.random()+Math.random()-2)/2;

export class LineChart {
  constructor(canvas, color = '#60a5fa'){
    this.c = canvas; this.ctx = ctx2d(canvas);
    this.col = color; this.pad = { l:46, r:12, t:12, b:22 };
    this.data = []; this.xmin = 0; this.xmax = 1;
    this._drawScheduled = false; // Çizim optimizasyonu için
    this._cached = {}; // Cacheleme için
    this._resizeTimeout = null;
    this._defaultValue = 0; // Varsayılan başlangıç değeri
    
    // Resize olayını optimize et
    window.addEventListener('resize', () => {
      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        this.ctx = ctx2d(this.c);
        this._cached = {}; // Boyut değiştiği için önbelleği temizle
        this.draw();
        this._resizeTimeout = null;
      }, 250);
    });
  }
  
  setRange(a,b){ this.xmin=a; this.xmax=b; }
  
  push(t,v){ 
    this.data.push({t:+t,v:+v}); 
    // Veri seti kontrolü - aşırı büyük veriler için daha agresif temizleme
    if(this.data.length > 20000) {
      this.data.splice(0, this.data.length - 10000); // Yarısını temizle
    }
  }
  
  // Tüm veri noktalarını temizle
  clearData() {
    // Completely empty the data array
    this.data = [];
    
    // Add baseline data points to avoid empty chart
    const currentTime = now();
    this.push(currentTime-10, this._defaultValue);
    this.push(currentTime, this._defaultValue);
    
    // Update range to show current time window
    this.xmin = currentTime-10;
    this.xmax = currentTime;
    
    // Force redraw
    this.draw();
  }
  
  // Koordinat dönüşümlerini önbellekle
  _x(t){ 
    // Önceden hesaplanmış değer varsa onu kullan
    const cacheKey = `x_${t}_${this.xmin}_${this.xmax}`;
    if (this._cached[cacheKey] !== undefined) return this._cached[cacheKey];
    
    const w = this.c.getBoundingClientRect().width - this.pad.l - this.pad.r; 
    const result = this.pad.l + (t-this.xmin)*w/(this.xmax-this.xmin || 1);
    
    // Sonucu önbelleğe al (en fazla 100 değer cache'le)
    if (Object.keys(this._cached).length < 100) {
      this._cached[cacheKey] = result;
    }
    return result;
  }
  
  _y(v,y0,y1){ 
    const cacheKey = `y_${v}_${y0}_${y1}`;
    if (this._cached[cacheKey] !== undefined) return this._cached[cacheKey];
    
    const h = this.c.getBoundingClientRect().height - this.pad.t - this.pad.b; 
    const result = this.pad.t + (y1-v)*h/(y1-y0 || 1);
    
    if (Object.keys(this._cached).length < 100) {
      this._cached[cacheKey] = result;
    }
    return result; 
  }
  draw(){
    // Sayfa görünür değilse veya planlı bir çizim varsa atla
    if (window.canAppHidden || this._drawScheduled) return;
    
    // Sadece görünür ise çizim yap
    const isVisible = document.visibilityState !== 'hidden' && 
                      this.c.offsetParent !== null;
    
    if (!isVisible) return;
    
    // Çizim planla - çoklu çizim çağrılarını tek bir çizime birleştir
    this._drawScheduled = true;
    
    requestAnimationFrame(() => {
      this._drawScheduled = false;
      this._drawNow();
    });
  }
  
  // Asıl çizim fonksiyonu
  _drawNow(){
    this.ctx = ctx2d(this.c);
    const ctx=this.ctx, r=this.c.getBoundingClientRect(), W=r.width, H=r.height;
    ctx.clearRect(0,0,W,H);
    
    // Performans için veri noktalarını örnekle (downsample)
    const maxPoints = 150; // Maksimum gösterilecek nokta sayısı
    const visibleData = this.data.filter(p => p.t >= this.xmin && p.t <= this.xmax);
    let dataToUse = visibleData;
    
    // Çok fazla nokta varsa, örnekle
    if (visibleData.length > maxPoints) {
      const step = Math.ceil(visibleData.length / maxPoints);
      dataToUse = [];
      for (let i = 0; i < visibleData.length; i += step) {
        dataToUse.push(visibleData[i]);
      }
      // Son noktayı ekleyin
      if (visibleData.length > 0 && dataToUse[dataToUse.length-1] !== visibleData[visibleData.length-1]) {
        dataToUse.push(visibleData[visibleData.length-1]);
      }
    }
    
    // Min/max değerleri bul
    let y0=Infinity, y1=-Infinity;
    for(const p of dataToUse) { 
      if(p.v<y0) y0=p.v; 
      if(p.v>y1) y1=p.v; 
    }
    if(!isFinite(y0)){ y0=0; y1=1; } if(y0===y1){ y0-=1; y1+=1; }

    ctx.strokeStyle='#1f2430'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(this.pad.l,this.pad.t); ctx.lineTo(this.pad.l,H-this.pad.b); ctx.lineTo(W-this.pad.r,H-this.pad.b); ctx.stroke();

    // Yalnızca 3 çizgi çizerek (0, 50%, 100%) performansı arttır
    ctx.strokeStyle='#151b24'; ctx.fillStyle='#b7c0cd'; ctx.font='11px ui-sans-serif';
    for(let i of [0,2,5]){ // Sadece bazı değerleri göster
      const v=y0+(y1-y0)*i/5; const py=this._y(v,y0,y1);
      ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
      ctx.fillText(v.toFixed(0),6,py+3);
    }

    // Çizgi çizimi
    ctx.strokeStyle=this.col; ctx.lineWidth=1.6; ctx.beginPath();
    let started=false;
    for(const p of dataToUse){ 
      const xx=this._x(p.t), yy=this._y(p.v,y0,y1);
      if(!started){ ctx.moveTo(xx,yy); started=true; } else ctx.lineTo(xx,yy); 
    } 
    ctx.stroke();
  }
}

export class MultiLineChart {
  constructor(canvas, colors=['#60a5fa','#a78bfa','#34d399']){
    this.c = canvas; this.ctx = ctx2d(canvas);
    this.pad = { l:46, r:12, t:12, b:22 };
    this.series = colors.map(col => ({ col, data: [] }));
    this.xmin=0; this.xmax=1;
    window.addEventListener('resize', () => this.ctx = ctx2d(this.c));
  }
  setRange(a,b){ this.xmin=a; this.xmax=b; }
  push(i,t,v){ const s=this.series[i]; if(!s) return; s.data.push({t:+t,v:+v}); if(s.data.length>20000) s.data.splice(0,s.data.length-20000); }
  
  // Tüm veri serilerini temizle
  clearData() {
    const now = Date.now() / 1000;
    this.series.forEach(s => {
      s.data = [
        {t: now-10, v: 0},
        {t: now, v: 0}
      ];
    });
    this.xmin = now-10;
    this.xmax = now;
  }
  draw(){
    this.ctx = ctx2d(this.c); const ctx=this.ctx, r=this.c.getBoundingClientRect(), W=r.width, H=r.height;
    ctx.clearRect(0,0,W,H);
    let y0=Infinity,y1=-Infinity;
    for(const s of this.series){ for(const p of s.data){ if(p.t>=this.xmin && p.t<=this.xmax){ if(p.v<y0)y0=p.v; if(p.v>y1)y1=p.v; } } }
    if(!isFinite(y0)){ y0=0; y1=1; } if(y0===y1){ y0-=1; y1+=1; }
    ctx.strokeStyle='#1f2430'; ctx.beginPath(); ctx.moveTo(this.pad.l,this.pad.t); ctx.lineTo(this.pad.l,H-this.pad.b); ctx.lineTo(W-this.pad.r,H-this.pad.b); ctx.stroke();
    ctx.strokeStyle='#151b24'; ctx.fillStyle='#b7c0cd'; ctx.font='11px ui-sans-serif';
    for(let i=0;i<=5;i++){ const v=y0+(y1-y0)*i/5; const py=this._y(v,y0,y1);
      ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
      ctx.fillText(v.toFixed(0),6,py+3); }
    for(const s of this.series){ ctx.strokeStyle=s.col; ctx.lineWidth=1.6; ctx.beginPath(); let started=false;
      for(const p of s.data){ if(p.t<this.xmin || p.t>this.xmax) continue; const xx=this._x(p.t), yy=this._y(p.v,y0,y1);
        if(!started){ ctx.moveTo(xx,yy); started=true; } else ctx.lineTo(xx,yy); } ctx.stroke(); }
  }
  _x(t){ const w=this.c.getBoundingClientRect().width - this.pad.l - this.pad.r; return this.pad.l + (t-this.xmin)*w/(this.xmax-this.xmin || 1); }
  _y(v,y0,y1){ const h=this.c.getBoundingClientRect().height - this.pad.t - this.pad.b; return this.pad.t + (y1-v)*h/(y1-y0 || 1); }
}
