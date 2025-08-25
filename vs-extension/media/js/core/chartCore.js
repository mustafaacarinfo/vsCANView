export function ctx2d(canvas){
  // Canvas görünür değilse veya boyutu 0 ise işlem yapma
  if (!canvas || !canvas.getBoundingClientRect) return null;
  
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) {
    // Görünür olmayan canvas için minimum boyut ver
    canvas.width = 1;
    canvas.height = 1;
    return canvas.getContext('2d');
  }
  
  // Performans optimizasyonu: piksel oranını sınırla
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // Maksimum 2x
  const W = Math.max(1, Math.round(r.width  * dpr));
  const H = Math.max(1, Math.round(r.height * dpr));
  
  // Boyut değişikliği varsa güncelle
  if(canvas.width !== W || canvas.height !== H){ 
    canvas.width = W; 
    canvas.height = H; 
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
  }
  
  const ctx = canvas.getContext('2d', { 
    alpha: true, 
    desynchronized: true,
    willReadFrequently: false // Performans artışı
  });
  
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true; // Daha iyi görünüm için açık
  ctx.imageSmoothingQuality = 'high'; // Kaliteli smoothing
  
  // roundRect polyfill (Safari eski sürümler için)
  if(!ctx.roundRect){
    ctx.roundRect = function(x,y,w,h,r){
      const rr = Math.min(r, w/2, h/2) || 0;
      this.moveTo(x+rr,y);
      this.lineTo(x+w-rr,y);
      this.quadraticCurveTo(x+w,y,x+w,y+rr);
      this.lineTo(x+w,y+h-rr);
      this.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
      this.lineTo(x+rr,y+h);
      this.quadraticCurveTo(x,y+h,x,y+h-rr);
      this.lineTo(x,y+rr);
      this.quadraticCurveTo(x,y,x+rr,y);
    };
  }
  return ctx;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const now   = () => Date.now() / 1000;
export const rand  = () => (Math.random()+Math.random()+Math.random()+Math.random()-2)/2;

export class LineChart {
  constructor(canvas, color = '#60a5fa', options = {}){
    this.c = canvas; this.ctx = ctx2d(canvas);
    this.col = color; this.pad = { l:60, r:20, t:15, b:40 };
    this.data = []; this.xmin = 0; this.xmax = 1;
    this._drawScheduled = false; // Çizim optimizasyonu için
    this._cached = {}; // Cacheleme için
    this._resizeTimeout = null;
    this._defaultValue = 0; // Varsayılan başlangıç değeri
    this._hoverX = null; // Hover (piksel koordinatı)
    this._hoverPoint = null; // En yakın nokta
    this._showGradient = true;
    this._areaOpacity = 0.18;
    this._lastValueBadge = true;
    this._crosshair = true;
  // İlk gerçek değerden önceki dikey kılçığı engellemek için priming bayrağı
  this._primed = false;
  this._selectedPoint = null; // Kullanıcı tıklaması ile sabitlenen nokta
  this._selectRadius = 18; // px içinde en yakın nokta seçilir
    this._showHLine = true; // Hover yatay kılavuz
  this.name = options.name || 'Value';
  this.yLabel = options.yLabel || null; // Y ekseni etiketi
  this.referenceLines = options.referenceLines || []; // [{value:50,color:'#',dash:[6,4]}]
  this.showTimeAxis = options.showTimeAxis || false; // X ekseni zaman etiketi
  this.timeAxisFormat = options.timeAxisFormat || 'HH:MM';
  this.tooltipDateFormat = options.tooltipDateFormat || 'YYYY-MM-DD HH:MM:ss';
  this.tightY = !!options.tightY; // Sıkı y aralığı (grafik yüksekliğini doldur)
  this.smoothingFactor = +options.smoothingFactor || 0; // 0..1 EMA katsayısı (0 = kapalı)
  this.autoMidline = !!options.autoMidline; // Otomatik orta referans çizgisi
  this.forceZeroMin = !!options.forceZeroMin; // Y ekseni altını zorla 0 yap
  this.dynamicNiceY = !!options.dynamicNiceY; // Otomatik güzel (nice) aralık & tick adımı
  this.showLastTimestamp = !!options.showLastTimestamp; // Alt bilgi olarak son mesaj zamanı
  this.liveMode = !!options.liveMode; // Sürekli animasyonlu redraw (yüksek FPS)
  this.targetFps = options.targetFps || 60; // liveMode için hedef FPS
  this.fixedYMax = (typeof options.fixedYMax === 'number') ? options.fixedYMax : null; // Sabit üst limit
  this._lastAnimFrame = 0; this._frameIntervalMs = 1000/this.targetFps;
  this.fixedYMin = (typeof options.fixedYMin === 'number') ? options.fixedYMin : null;
  this.yTickStep = (typeof options.yTickStep === 'number') ? options.yTickStep : null; // Örn: 20 -> 0,20,40...
  
  // Dinamik padding ayarları - time axis ve timestamp için
  if(this.showLastTimestamp && this.showTimeAxis && this.pad.b < 70) {
    this.pad.b = 70;
  } else if(this.showTimeAxis && this.pad.b < 50) {
    this.pad.b = 50;
  } else if(this.showLastTimestamp && this.pad.b < 25) {
    this.pad.b = 25;
  }
    
    // Resize olayını optimize et
    window.addEventListener('resize', () => {
      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        // Canvas context'ini yeniden oluştur
        const newCtx = ctx2d(this.c);
        if (newCtx) {
          this.ctx = newCtx;
          this._cached = {}; // Boyut değiştiği için önbelleği temizle
          
          // Birkaç frame bekleyip çiz
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.draw();
            });
          });
        }
        this._resizeTimeout = null;
      }, 100); // Daha hızlı response için süreyi kısalttık
    });

    // Mouse etkileşimleri (Grafana benzeri crosshair & tooltip)
    this.c.addEventListener('mousemove', (e)=>{
      const rect = this.c.getBoundingClientRect();
      this._hoverX = e.clientX - rect.left;
      this._updateHoverPoint();
      this._drawNow(); // Anında güncelle (hafif)
    });
    this.c.addEventListener('mouseleave', ()=>{
      this._hoverX = null; this._hoverPoint = null; this.draw();
    });

    const pickPoint = (clientX, clientY) => {
      const rect = this.c.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // X -> zaman
      const w = rect.width - this.pad.l - this.pad.r;
      const norm = clamp((x - this.pad.l) / (w || 1), 0, 1);
      const ht = this.xmin + norm * (this.xmax - this.xmin);
      const source = this._renderData || this.data;
      if(!source.length){ this._selectedPoint=null; this.draw(); return; }
      // Segment bul (ht'yi çevreleyen)
      let p0 = source[0], p1 = source[source.length-1];
      for(let i=0;i<source.length-1;i++){ if(source[i].t<=ht && source[i+1].t>=ht){ p0=source[i]; p1=source[i+1]; break; } }
      const span = (p1.t - p0.t) || 1; const ratio = clamp((ht - p0.t)/span,0,1);
      const interpV = p0.v + (p1.v - p0.v)*ratio;
      const interpPoint = { t: ht, v: interpV, _interp:true };
      const ix = this._x(interpPoint.t); const iy = this._y(interpPoint.v, this._currentY0||0, this._currentY1||1);
      // En yakın gerçek vertex'i bul
      let bestVertex=null, bestDist=Infinity;
      for(const p of source){ if(p.t < this.xmin || p.t > this.xmax) continue; const px=this._x(p.t); const py=this._y(p.v,this._currentY0||0,this._currentY1||1); const dx=px-x; const dy=py-y; const d=Math.hypot(dx,dy); if(d<bestDist){ bestDist=d; bestVertex=p; } }
      const dInterp = Math.hypot(ix - x, iy - y);
      const chosen = (dInterp < bestDist) ? interpPoint : bestVertex;
      if(chosen){
        if(this._selectedPoint && !this._selectedPoint._interp && chosen.t === this._selectedPoint.t && chosen.v === this._selectedPoint.v){
          this._selectedPoint = null; // aynı vertex tekrar tıklanınca kaldır
        } else if(this._selectedPoint && this._selectedPoint._interp && chosen._interp){
          // Aynı interpolasyon bölgesine tekrar tıklandıysa kaldır
          const dt = Math.abs(this._selectedPoint.t - chosen.t);
          if(dt < (this.xmax - this.xmin)*0.001) this._selectedPoint=null; else this._selectedPoint=chosen;
        } else {
          this._selectedPoint = chosen;
        }
      }
      this.draw();
    };

    this.c.addEventListener('click', (e)=>{ pickPoint(e.clientX, e.clientY); });
    this.c.addEventListener('touchstart', (e)=>{ if(e.touches && e.touches[0]){ pickPoint(e.touches[0].clientX, e.touches[0].clientY); } }, {passive:true});
    window.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ this._selectedPoint=null; this.draw(); } });
  }
  
  setRange(a,b){ this.xmin=a; this.xmax=b; }
  
  push(t,v){ 
    // İlk gerçek değer geldiğinde geçmiş placeholder değerleri (varsayılan) aynı seviyeye çek
    const num = +v;
    if(!this._primed && this.data.length >= 2){
      let allBaseline = true;
      for(const p of this.data){ if(p.v !== this._defaultValue){ allBaseline=false; break; } }
      if(allBaseline && num !== this._defaultValue){
        for(const p of this.data){ p.v = num; }
        this._primed = true;
      }
    }
    // Eğer veri zaten baseline'dan farklılaşmışsa primed kabul et
    if(!this._primed && num !== this._defaultValue && this.data.length > 0){ this._primed = true; }
    this.data.push({t:+t,v:num}); 
    // Veri seti kontrolü - aşırı büyük veriler için daha agresif temizleme
    if(this.data.length > 20000) {
      this.data.splice(0, this.data.length - 10000); // Yarısını temizle
    }
  }
  
  // Tüm veri noktalarını temizle
  clearData() {
    // Completely empty the data array
    this.data = [];
  this._primed = false; // yeniden başlat
    
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
    if (window.canAppHidden) return;
    if(this.liveMode){
      // Live modda zaten animasyon döngüsü varsa tekrar planlama
      if(!this._animating){
        this._animating = true;
        const loop = (ts)=>{
          if(window.canAppHidden){ this._animating=false; return; }
          requestAnimationFrame(loop);
          if(ts - this._lastAnimFrame < this._frameIntervalMs) return;
          this._lastAnimFrame = ts;
          this._drawNow();
        };
        requestAnimationFrame(loop);
      }
      return;
    }
    if (this._drawScheduled) return;
    
    // Sadece görünür ise çizim yap
    const isVisible = document.visibilityState !== 'hidden' && 
                      this.c.offsetParent !== null;
    
    if (!isVisible){
      // Görünür değilken bir dizi artan gecikmeli yeniden deneme planla
      if(this._visRetryCount == null) this._visRetryCount = 0;
      if(this._visRetryCount < 5){
        const delays = [40,90,160,260,400];
        const d = delays[this._visRetryCount] || 400;
        this._visRetryCount++;
        setTimeout(()=> this.draw(), d);
      }
      return;
    } else {
      this._visRetryCount = 0; // görünür olduğunda sıfırla
    }
    
    // Çizim planla - çoklu çizim çağrılarını tek bir çizime birleştir
    this._drawScheduled = true;
    
    requestAnimationFrame(() => {
      this._drawScheduled = false;
      this._drawNow();
    });
  }
  
  // Asıl çizim fonksiyonu
  _drawNow(){
    // Canvas görünür değilse çizim yapma
    if (!this.c || !this.c.getBoundingClientRect) return;
    
    const r = this.c.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    
    // Mevcut canvas boyutu değiştiyse context'i güncelle
    const needCtxResize = (this.c._lastW !== r.width || this.c._lastH !== r.height);
    if(needCtxResize || !this.ctx){
      const newCtx = ctx2d(this.c);
      if (newCtx) {
        this.ctx = newCtx;
        this.c._lastW = r.width; 
        this.c._lastH = r.height;
        this._cached = {}; // Cache'i temizle
      } else {
        return; // Context oluşturulamadı
      }
    }
    
    const ctx = this.ctx, W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    
    // Performans için veri noktalarını örnekle (downsample) - LTTB benzeri hafif yöntem
    const visibleData = this.data.filter(p => p.t >= this.xmin && p.t <= this.xmax);
    let dataToUse = visibleData;
    const maxPoints = this.liveMode ? 300 : 180;
    if (visibleData.length > maxPoints) {
      const bucketSize = (visibleData.length - 2) / (maxPoints - 2);
      const sampled = [visibleData[0]];
      let a = 0;
      for (let i = 0; i < maxPoints - 2; i++) {
        const rangeStart = (i + 1) * bucketSize + 1;
        const rangeEnd = (i + 2) * bucketSize + 1;
        const rangeStartIdx = Math.floor(rangeStart);
        const rangeEndIdx = Math.min(visibleData.length, Math.floor(rangeEnd));
        let avgT = 0, avgV = 0, count = 0;
        for (let j = rangeStartIdx; j < rangeEndIdx; j++) { avgT += visibleData[j].t; avgV += visibleData[j].v; count++; }
        avgT /= count || 1; avgV /= count || 1;
        let maxArea = -1; let maxPoint = null;
        const rangeAEnd = Math.min(Math.floor((i+1)*bucketSize)+2, visibleData.length);
        for (let j = a+1; j < rangeAEnd; j++) {
          const area = Math.abs((visibleData[a].t - avgT) * (visibleData[j].v - visibleData[a].v) - (visibleData[a].t - visibleData[j].t) * (avgV - visibleData[a].v));
          if (area > maxArea) { maxArea = area; maxPoint = visibleData[j]; }
        }
        if(maxPoint) sampled.push(maxPoint);
        a = visibleData.indexOf(maxPoint);
      }
      sampled.push(visibleData[visibleData.length - 1]);
      dataToUse = sampled;
    }
    
  // Min/max değerleri bul
    let y0=Infinity, y1=-Infinity; const vals=[];
    for(const p of dataToUse) { vals.push(p.v); if(p.v<y0) y0=p.v; if(p.v>y1) y1=p.v; }
    if(!isFinite(y0)){ y0=0; y1=1; }
    if(y0===y1){ y0-=1; y1+=1; }
    if(this.tightY && vals.length){
      // Outlier kırpma (trim %5) & minimal margin
      const sorted=[...vals].sort((a,b)=>a-b);
      const trim = Math.floor(sorted.length*0.05);
      const core = sorted.slice(trim, sorted.length-trim || sorted.length);
      if(core.length){ y0 = Math.min(...core); y1 = Math.max(...core); if(y0===y1){ y0-=1; y1+=1; } }
      const r = (y1 - y0)||1; const m = r*0.04; y0-=m; y1+=m;
    } else {
      // Dinamik padding (üst & alt %6)
      const baseRange = (y1 - y0) || 1; const padY = baseRange * 0.06; y0 -= padY; y1 += padY;
      if(vals.length >= 3){
        const sorted = [...vals].sort((a,b)=>a-b);
        const q1 = sorted[Math.floor(sorted.length*0.25)];
        const q3 = sorted[Math.floor(sorted.length*0.75)];
        const iqr = q3 - q1 || 1; const upperFence = q3 + iqr*3; const lowerFence = q1 - iqr*3;
        if(y1 > upperFence){ y1 = upperFence + (upperFence - y0)*0.05; }
        if(y0 < lowerFence){ y0 = lowerFence - (y1 - lowerFence)*0.05; }
      }
    }
    // Sıfır gereksizse (ör. tüm değerler yüksek) altı yukarı çek (forceZeroMin kapalı ise)
  if(!this.forceZeroMin && y0 < 0){
      const positiveVals = vals.filter(v=>v>0);
      if(positiveVals.length > 3){
        const minPos = Math.min(...positiveVals);
        if(minPos > (y1 * 0.30)){
          const spanAbove = y1 - minPos;
            y0 = Math.max(0, minPos - spanAbove*0.15);
        } else {
          y0 = Math.max(0, y0);
        }
      } else {
        y0 = Math.max(0, y0);
      }
    }

    // Alt ekseni 0'a sabitle (ör: hız grafiği)
  if(this.forceZeroMin) y0 = 0;
  if(this.fixedYMin != null) y0 = this.fixedYMin;
  if(this.fixedYMax != null) y1 = this.fixedYMax;
  // Dinamik güzel (nice) aralık: sabit limit yoksa ve etkinse uygula
  let localTickStep = null;
  if(this.dynamicNiceY && this.fixedYMin == null && this.fixedYMax == null){
    // Nice number algoritması (Graphics Gems varyantı)
    const niceNum = (range, round)=>{
      const exp = Math.floor(Math.log10(range || 1));
      const frac = (range || 1) / Math.pow(10, exp);
      let niceFrac;
      if(round){
        if(frac < 1.5) niceFrac = 1; else if(frac < 3) niceFrac = 2; else if(frac < 7) niceFrac = 5; else niceFrac = 10;
      } else {
        if(frac <= 1) niceFrac = 1; else if(frac <= 2) niceFrac = 2; else if(frac <= 5) niceFrac = 5; else niceFrac = 10;
      }
      return niceFrac * Math.pow(10, exp);
    };
    const targetTicks = 6; // 5-6 arası güzel
    const rawRange = y1 - y0;
    let niceRange = niceNum(rawRange, false);
    let step = niceNum(niceRange / (targetTicks - 1), true);
    let graphMin = Math.floor(y0 / step) * step;
    let graphMax = Math.ceil(y1 / step) * step;
    // Eğer forceZeroMin açıksa min'i yine 0'a çek
    if(this.forceZeroMin){ graphMin = 0; if(y1 <= 0) graphMax = step; }
    // Çok sıkışık durumda (tek step) range'i genişlet
    if(graphMax === graphMin){ graphMax = graphMin + step; }
    y0 = graphMin; y1 = graphMax; localTickStep = step;
  }
  if(y1 - y0 < 1) y1 = y0 + 1; // güvenlik
    // Aşırı ince range'e karşı koruma
  if(y1 - y0 < 1){ const mid=(y0+y1)/2; y0=mid-0.5; y1=mid+0.5; }
  // Son güvenlik: sonsuz/NaN durumlarını engelle
  if(!isFinite(y0) || !isFinite(y1)){ y0=0; y1=1; }
  // Seçilmiş nokta için y ölçeğini hatırla (nokta aramada kullanıldı)
  this._currentY0 = y0; this._currentY1 = y1;

    ctx.strokeStyle='#1f2430'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(this.pad.l,this.pad.t); ctx.lineTo(this.pad.l,H-this.pad.b); ctx.lineTo(W-this.pad.r,H-this.pad.b); ctx.stroke();

    // Grid çizgileri (daha okunaklı) - 5 aralık
      // Grid çizgileri
  ctx.strokeStyle='#151b24'; ctx.fillStyle='#94a3b8'; ctx.font='11px "Inter","Segoe UI",system-ui,sans-serif';
      const effTick = this.yTickStep || localTickStep; 
      if(effTick){
        const startTick = Math.ceil(y0 / effTick) * effTick;
        for(let v = startTick; v <= y1 + 1e-9; v += effTick){
          const py = this._y(v,y0,y1);
          ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
          ctx.fillText(v.toFixed(0),10,py+4);
        }
        // Alt ve üst sınır etiketleri yoksa ekle
        if(startTick > y0 + 1e-9){ const py=this._y(y0,y0,y1); ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke(); ctx.fillText(y0.toFixed(0),10,py+4); }
        if(Math.abs((y1 - (Math.floor(y1/effTick))*effTick)) > 0.001){ const py=this._y(y1,y0,y1); ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke(); ctx.fillText(y1.toFixed(0),10,py+4); }
      } else {
        for(let i=0;i<=5;i++){
          const v = y0 + (y1-y0)*i/5; const py=this._y(v,y0,y1);
          ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
          ctx.fillText(v.toFixed(0),10,py+4);
        }
      }

    // Referans çizgileri + otomatik orta çizgi
    let anyRefVisible = false;
    if(this.referenceLines.length){
      for(const rl of this.referenceLines){
        if(rl.value < y0 || rl.value > y1) continue;
        anyRefVisible = true;
        const py = this._y(rl.value, y0, y1);
        ctx.save();
        ctx.strokeStyle = rl.color || '#64748b';
        ctx.lineWidth = rl.width || 1;
        if(rl.dash) ctx.setLineDash(rl.dash); else ctx.setLineDash([6,4]);
        ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
        ctx.setLineDash([]);
  ctx.fillStyle = rl.color || '#64748b';
  ctx.font='10px "Inter","Segoe UI",system-ui,sans-serif';
        ctx.fillText((rl.label || rl.value+'').toString(), W-this.pad.r-40, py-4);
        ctx.restore();
      }
    }
    if(!anyRefVisible && this.autoMidline){
      const mid = y0 + (y1-y0)/2;
      const py = this._y(mid, y0, y1);
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.setLineDash([5,5]);
      ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
      ctx.setLineDash([]);
  ctx.fillStyle = '#64748b'; ctx.font='10px "Inter","Segoe UI",system-ui,sans-serif';
      ctx.fillText(mid.toFixed(0), W-this.pad.r-40, py-4);
      ctx.restore();
    }

    // Y ekseni etiketi
    if(this.yLabel){
      ctx.save();
  ctx.fillStyle='#cbd5e1';
  ctx.font='12px "Inter","Segoe UI",system-ui,sans-serif';
      // Biraz daha sağa kaydır (önceden 14 idi)
      const labelX = Math.max(20, Math.min(this.pad.l - 20, 30)); // dinamik güvenli
      ctx.translate(labelX, (H - this.pad.b + this.pad.t)/2);
      ctx.rotate(-Math.PI/2);
      ctx.textAlign='center';
      ctx.fillText(this.yLabel,0,0);
      ctx.restore();
    }

    // Opsiyonel yumuşatma (EMA)
    let lineData = dataToUse;
    if(this.smoothingFactor > 0 && dataToUse.length > 2){
      const alpha = Math.min(0.95, Math.max(0.01, this.smoothingFactor));
      const smooth=[]; let prev = dataToUse[0].v;
      smooth.push({t:dataToUse[0].t, v:prev});
      for(let i=1;i<dataToUse.length;i++){
        const raw = dataToUse[i].v;
        // Arada büyük sıçrama varsa (>%40 range) ham değere daha hızlı yaklaş
        const jump = Math.abs(raw - prev);
        const dynA = jump > (y1 - y0) * 0.4 ? Math.min(1, alpha*2) : alpha;
        prev = prev + dynA * (raw - prev);
        smooth.push({t:dataToUse[i].t, v:prev});
      }
      lineData = smooth;
    } else if(this.smoothingFactor === 0 && dataToUse.length > 2 && dataToUse.length < 20){
      // Başlangıç kılçıklanmasını azaltmak için ilk birkaç noktada hafif otomatik smoothing
      // Orijinal veriyi değiştirmeden sadece çizim üzerinde uygula
      const n = dataToUse.length;
      // Nokta sayısı azaldıkça daha fazla yumuşatma (alpha düşük) -> n yaklaştıkça azalır
      const baseAlpha = 0.35; // başlangıçta kuvvetli
      const minAlpha = 0.15;  // 20'ye yaklaşınca hafif
      const alpha = minAlpha + (baseAlpha - minAlpha) * Math.max(0, (20 - n)/18);
      let prev = dataToUse[0].v;
      const smooth=[{t:dataToUse[0].t, v:prev}];
      for(let i=1;i<dataToUse.length;i++){
        const raw = dataToUse[i].v;
        prev = prev + alpha * (raw - prev);
        smooth.push({t:dataToUse[i].t, v:prev});
      }
      lineData = smooth;
    }
  // Çizim için kullanılan veri setini sakla (smoothing ve downsample sonrası tam kopya)
  this._renderData = lineData;

    // Çizgi (path) + opsiyonel gradient dolgu
    ctx.lineWidth=1.6; ctx.beginPath();
    let started=false; let firstX=null, lastX=null; let lastY=null;
    for(const p of lineData){
      const xx=this._x(p.t), yy=this._y(p.v,y0,y1);
      if(firstX==null) firstX = xx; lastX = xx; lastY=yy;
      if(!started){ ctx.moveTo(xx,yy); started=true; } else ctx.lineTo(xx,yy);
    }
  const canFill = this._showGradient && started && this._primed; // priming tamamlanmadan alan doldurma yok
  if(canFill){
      // Alan kapat
      ctx.save();
      const grad = ctx.createLinearGradient(0,this.pad.t,0,H-this.pad.b);
      const base = this._hexToRgb(this.col) || {r:96,g:165,b:250};
      grad.addColorStop(0,`rgba(${base.r},${base.g},${base.b},${this._areaOpacity})`);
      grad.addColorStop(1,'rgba(0,0,0,0)');
      ctx.lineTo(lastX,H-this.pad.b);
      ctx.lineTo(firstX,H-this.pad.b);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.restore();
      // Üst çizgi yeniden
      ctx.beginPath(); started=false;
      for(const p of lineData){ const xx=this._x(p.t), yy=this._y(p.v,y0,y1); if(!started){ ctx.moveTo(xx,yy); started=true; } else ctx.lineTo(xx,yy);}    
    }
    ctx.strokeStyle=this.col; ctx.stroke();

    // X ekseni zaman etiketleri (HH:MM)
    if(this.showTimeAxis){
      const timeSpan = this.xmax - this.xmin;
      const approxTicks = Math.max(4, Math.min(8, Math.floor(W / 80))); // Genişliğe göre tick sayısı
      // Yaklaşık tick aralığı (s) hesapla (1,5,10,30,60,120...)
      const candidates = [1,5,10,15,30,60,120,300,600,900,1800,3600,7200];
      let tickStep = candidates[candidates.length-1];
      for(const c of candidates){ if(timeSpan / c <= approxTicks){ tickStep=c; break; } }
      
      // İlk tick'i zaman aralığına göre hizala
      const firstTick = Math.ceil(this.xmin / tickStep) * tickStep;
      
      ctx.fillStyle='#94a3b8'; 
  ctx.font='11px "Inter","Segoe UI",system-ui,sans-serif'; 
      ctx.textAlign='center';
      ctx.textBaseline='top';
      
      // Grid çizgileri ve etiketler
      for(let t = firstTick; t <= this.xmax + tickStep/2; t += tickStep){
        const x = this._x(t);
        if(x < this.pad.l - 5 || x > W - this.pad.r + 5) continue;
        
        // Dikey grid çizgisi
        ctx.save();
        ctx.strokeStyle='#2a3441'; 
        ctx.lineWidth = 0.5;
        ctx.beginPath(); 
        ctx.moveTo(x, this.pad.t); 
        ctx.lineTo(x, H - this.pad.b); 
        ctx.stroke();
        
        // Tick mark
        ctx.strokeStyle='#1e2532'; 
        ctx.lineWidth = 1;
        ctx.beginPath(); 
        ctx.moveTo(x, H - this.pad.b); 
        ctx.lineTo(x, H - this.pad.b + 4); 
        ctx.stroke();
        
        // Time label
        const timeLabel = this._formatXAxisTime(t);
        ctx.fillText(timeLabel, x, H - this.pad.b + 25);
        ctx.restore();
      }
    }

    // Alt bilgi: son mesaj zaman damgası (HH:MM:SS)
    if(this.showLastTimestamp && dataToUse.length){
      const lastT = dataToUse[dataToUse.length-1].t;
      ctx.save();
  ctx.font='11px "Inter","Segoe UI",system-ui,sans-serif';
      ctx.fillStyle='#94a3b8';
      ctx.textAlign='left';
      ctx.textBaseline='bottom';
      const tsText = `Last update: ${this._formatTime(lastT)}`;
      
  // Debug log kaldırıldı (görsel temizlik)
      
      // Pozisyon hesaplama - time axis varsa onun çok altına
      let yPos;
      if (this.showTimeAxis) {
        yPos = H - 10; // Canvas'ın en altına daha yakın
      } else {
        yPos = H - 5; // Padding içinde
      }
      
      ctx.fillText(tsText, this.pad.l + 4, yPos);
      ctx.restore();
    }

    // Son değer badge (Grafana tarzı)
    if(this._lastValueBadge && lineData.length){
      const last = lineData[lineData.length-1];
      const px = this._x(last.t); const py = this._y(last.v,y0,y1);
  ctx.font='10px "Inter","Segoe UI",system-ui,sans-serif';
      // Precision
      let precision = Math.abs(last.v)>=100 ? 0 : 1;
      let txt = (Math.abs(last.v)>=10000) ? Math.round(last.v).toString() : last.v.toFixed(precision);
      const padX=6, padY=3, h=16, rds=4;
      const maxW = Math.min(120, Math.max(56, W*0.10));
      const measure = t=>ctx.measureText(t).width;
      if(measure(txt)+padX*2>maxW){
        // Compact form
        const a=Math.abs(last.v);
        if(a>=1e6) txt=(last.v/1e6).toFixed(1).replace(/\.0$/,'')+'M';
        else if(a>=1e3) txt=(last.v/1e3).toFixed(1).replace(/\.0$/,'')+'k';
      }
      if(measure(txt)+padX*2>maxW){ while(txt.length>2 && measure(txt+'…')+padX*2>maxW){ txt=txt.slice(0,-1);} txt+='…'; }
      const wBox = Math.ceil(measure(txt)+padX*2);
      // Sağda yer yoksa sola yerleştir
      const preferRight = px + 8 + wBox <= W - this.pad.r;
      let bx = preferRight ? px+8 : px - 8 - wBox;
      if(bx < this.pad.l+2) bx = this.pad.l+2; if(bx + wBox > W - this.pad.r - 2) bx = W - this.pad.r - 2 - wBox;
      let by = py - h/2; if(by < this.pad.t+2) by=this.pad.t+2; if(by+h > H - this.pad.b -2) by = H - this.pad.b - h -2;
      ctx.save(); ctx.translate(0.5,0.5);
      // Kutu
      ctx.fillStyle='#0f172a'; ctx.strokeStyle=this.col; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(bx,by,wBox,h,rds); ctx.fill(); ctx.stroke();
      // Metin
      ctx.fillStyle='#e2e8f0'; ctx.textBaseline='middle'; ctx.textAlign='left';
      ctx.fillText(txt, bx+padX, by + h/2 + 0.5);
      // Bağlantı çizgisi (küçük kuyruk)
      ctx.strokeStyle=this.col; ctx.beginPath();
      const tailX = preferRight ? bx : bx + wBox; const tailDir = preferRight ? -1 : 1;
      ctx.moveTo(px,py); ctx.lineTo(tailX, py); ctx.stroke();
      ctx.restore();
    }

    // Crosshair & tooltip
    if(this._crosshair && this._hoverPoint){
      const hp = this._hoverPoint; const xx = this._x(hp.t); const yy = this._y(hp.v,y0,y1);
      ctx.save();
      // Dikey çizgi
      ctx.strokeStyle = '#3a4556'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(xx,this.pad.t); ctx.lineTo(xx,H-this.pad.b); ctx.stroke();
      // Yatay çizgi (opsiyonel)
      if(this._showHLine){
        ctx.beginPath(); ctx.moveTo(this.pad.l,yy); ctx.lineTo(W-this.pad.r,yy); ctx.stroke();
      }
      // Nokta
      ctx.setLineDash([]); ctx.fillStyle=this.col; ctx.beginPath(); ctx.arc(xx,yy,4,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#0f172a'; ctx.stroke();
  // Tooltip içeriği (Grafana stili)
  const d = new Date(hp.t*1000);
  const dateStrFull = this._formatTooltipDate(d);
  const valueStr = hp.v.toFixed(2);
  // Improved tooltip typography
  ctx.font='500 12px "Inter","Segoe UI",system-ui,sans-serif';
  const paddingX = 14; const paddingY = 9; const lineH=18;
  // Uzun seri adını gerekli ise kısalt
  const maxInnerWidth = W - 24; // canvas içinde kalacak maksimum
  const shorten = (text, maxW)=>{ if(ctx.measureText(text).width <= maxW) return text; let res=text; while(res.length>3 && ctx.measureText(res+'…').width>maxW){ res=res.slice(0,-1);} return res+'…'; };
  const dateStr = shorten(dateStrFull, maxInnerWidth - paddingX*2);
  const baseLegend = this.name + '  ' + valueStr;
  const legendText = shorten(baseLegend, maxInnerWidth - paddingX*2 - 10 - 6);
  const wDate = ctx.measureText(dateStr).width;
  const wLegendText = ctx.measureText(legendText).width;
  const wLegend = 10 + 4 + wLegendText; // renk kutusu + gap + text
  let tw = Math.ceil(Math.max(wDate, wLegend)) + paddingX*2;
  const th = lineH*2 + paddingY*2;
  if(tw > maxInnerWidth) tw = maxInnerWidth; // son güvenlik
  let tx = xx + 14; let ty = yy - th - 8;
  if(tx + tw > W) tx = xx - tw - 14; if(tx < 2) tx = 2; if(ty < this.pad.t) ty = yy + 12; if(ty + th > H - this.pad.b) ty = H - this.pad.b - th - 4;
  // Kutu
  // Background with subtle elevation
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowBlur=8; ctx.shadowOffsetY=2;
  ctx.fillStyle='rgba(20,27,38,0.97)'; ctx.strokeStyle=this.col; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(tx,ty,tw,th,6); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Tarih satırı
  ctx.fillStyle='#f8fafc'; ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillText(dateStr, tx+paddingX, ty+paddingY);
  // Legend satırı
  const ly = ty + paddingY + lineH;
  ctx.fillStyle=this.col; ctx.fillRect(tx+paddingX, ly+4, 10,10); ctx.strokeStyle='#0f172a'; ctx.strokeRect(tx+paddingX, ly+4, 10,10);
  ctx.fillStyle='#f1f5f9'; ctx.fillText(legendText, tx+paddingX+10+6, ly);
      ctx.restore();
    }

    // Seçili nokta (kalıcı kutu)
    if(this._selectedPoint){
      const sp = this._selectedPoint; const sx=this._x(sp.t); const sy=this._y(sp.v,y0,y1);
      ctx.save();
      // Vurgu halkası
      ctx.fillStyle=this.col; ctx.beginPath(); ctx.arc(sx,sy,5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.arc(sx,sy,7,0,Math.PI*2); ctx.stroke();

      // İstatistikler (görünür aralık)
      let min=Infinity,max=-Infinity,sum=0,cnt=0; for(const p of dataToUse){ if(p.v<min)min=p.v; if(p.v>max)max=p.v; sum+=p.v; cnt++; }
      const avg = cnt? sum/cnt : sp.v;
      const txtLines = [
        'Value: '+sp.v.toFixed(2),
        'Time: '+this._formatTime(sp.t),
        'Min/Max: '+min.toFixed(1)+' / '+max.toFixed(1),
        'Average: '+avg.toFixed(1)
      ];
  ctx.font='500 12px "Inter","Segoe UI",system-ui,sans-serif';
  const lineH = 18; // adjusted for new font size
      const padX=12, padY=10;
      const maxW = Math.max(...txtLines.map(l=>ctx.measureText(l).width));
      const tw = Math.ceil(maxW) + padX*2 + 4; // ekstra 4px güvenlik payı
      const th = lineH*txtLines.length + padY*2;
      let tx = sx + 16; let ty = sy - th/2;
      // Kenar kontrolleri
      if(tx + tw > W) tx = sx - tw - 16;
      if(tx < 2) tx = 2;
      if(ty < this.pad.t) ty = this.pad.t;
      if(ty + th > H - this.pad.b) ty = H - this.pad.b - th;
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.30)'; ctx.shadowBlur=7; ctx.shadowOffsetY=2;
  ctx.fillStyle='rgba(17,24,39,0.97)'; ctx.strokeStyle=this.col; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(tx,ty,tw,th,6); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle='#f8fafc';
      ctx.textBaseline='top'; ctx.textAlign='left';
      txtLines.forEach((l,i)=> {
        const by = ty + padY + i*lineH; // top baseline kullanılıyor
        ctx.fillText(l, tx+padX, by);
      });
      ctx.restore();
    }
  }

  _formatTime(t){
    const d = new Date(t*1000);
    const use12 = /hh/i.test(this.timeAxisFormat) || this.timeAxisFormat.includes('12');
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2,'0');
    const s = String(d.getSeconds()).padStart(2,'0');
    if(use12){
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (h === 0) h = 12;
      return `${h}:${m}:${s} ${ampm}`;
    }
    return `${String(h).padStart(2,'0')}:${m}:${s}`;
  }

  _formatXAxisTime(t){
    const d = new Date(t*1000);
    const use12 = /hh/i.test(this.timeAxisFormat) || this.timeAxisFormat.includes('12');
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2,'0');
    if(use12){
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (h === 0) h = 12;
      return `${h}:${m} ${ampm}`;
    }
    return `${String(h).padStart(2,'0')}:${m}`;
  }

  _formatTooltipDate(d){
    const yyyy=d.getFullYear();
    const MM=String(d.getMonth()+1).padStart(2,'0');
    const DD=String(d.getDate()).padStart(2,'0');
    const use12 = /hh/i.test(this.timeAxisFormat) || this.timeAxisFormat.includes('12');
    let hh=d.getHours();
    const mm=String(d.getMinutes()).padStart(2,'0');
    const ss=String(d.getSeconds()).padStart(2,'0');
    if(use12){
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const h12 = (hh % 12) || 12;
      return `${yyyy}-${MM}-${DD} ${h12}:${mm}:${ss} ${ampm}`;
    }
    return `${yyyy}-${MM}-${DD} ${String(hh).padStart(2,'0')}:${mm}:${ss}`;
  }

  _hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : null;
  }

  _updateHoverPoint(){
    if(this._hoverX==null) { this._hoverPoint=null; return; }
    // X -> time dönüşümü
    const rectW = this.c.getBoundingClientRect().width - this.pad.l - this.pad.r;
    const norm = clamp((this._hoverX - this.pad.l) / (rectW || 1), 0, 1);
    const ht = this.xmin + norm * (this.xmax - this.xmin);
  const source = this._renderData || this.data;
  if(!source.length){ this._hoverPoint=null; return; }
  // Segment bul ve interpolasyon
  let p0 = source[0], p1 = source[source.length-1];
  for(let i=0;i<source.length-1;i++){ if(source[i].t<=ht && source[i+1].t>=ht){ p0=source[i]; p1=source[i+1]; break; } }
  const span = (p1.t - p0.t) || 1; const ratio = clamp((ht - p0.t)/span,0,1);
  const interpV = p0.v + (p1.v - p0.v)*ratio;
  this._hoverPoint = { t: ht, v: interpV, _interp:true };
  }
}

export class MultiLineChart {
  constructor(canvas, colors=['#60a5fa','#a78bfa','#34d399']){
    this.c = canvas; this.ctx = ctx2d(canvas);
    this.pad = { l:60, r:20, t:15, b:40 };
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
  ctx.strokeStyle='#151b24'; ctx.fillStyle='#b7c0cd'; ctx.font='11px "Inter","Segoe UI",system-ui,sans-serif';
    for(let i=0;i<=5;i++){ const v=y0+(y1-y0)*i/5; const py=this._y(v,y0,y1);
      ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
      ctx.fillText(v.toFixed(0),10,py+4); }
    for(const s of this.series){ ctx.strokeStyle=s.col; ctx.lineWidth=1.6; ctx.beginPath(); let started=false;
      for(const p of s.data){ if(p.t<this.xmin || p.t>this.xmax) continue; const xx=this._x(p.t), yy=this._y(p.v,y0,y1);
        if(!started){ ctx.moveTo(xx,yy); started=true; } else ctx.lineTo(xx,yy); } ctx.stroke(); }
  }
  _x(t){ const w=this.c.getBoundingClientRect().width - this.pad.l - this.pad.r; return this.pad.l + (t-this.xmin)*w/(this.xmax-this.xmin || 1); }
  _y(v,y0,y1){ const h=this.c.getBoundingClientRect().height - this.pad.t - this.pad.b; return this.pad.t + (y1-v)*h/(y1-y0 || 1); }
}

// Çoklu alan grafiği (şeffaf üst üste binen alanlar)
export class MultiAreaChart extends MultiLineChart {
  constructor(canvas, options={}){
    super(canvas, options.colors || ['#60a5fa','#a78bfa','#34d399','#f59e0b','#ef4444','#10b981']);
    this.maxSeries = options.maxSeries || 8;
    this.seriesMap = new Map(); // signalName -> index
    this.alpha = options.alpha || 0.22;
    this.lineWidth = options.lineWidth || 1.4;
    this.windowSec = options.windowSec || 120;
  }
  setWindow(sec){ this.windowSec = sec; }
  ensureSeries(names){
    // Remove any series not in names
    for(const [name,idx] of [...this.seriesMap.entries()]){
      if(!names.includes(name)){
        this.seriesMap.delete(name);
        // keep data but mark unused? simplest: clear data so it disappears
        if(this.series[idx]) this.series[idx].data=[];
      }
    }
    names.forEach(n => {
      if(this.seriesMap.has(n)) return;
      // find free slot
  const used = new Set(this.seriesMap.values());
  let slot = this.series.findIndex((s,i)=>!used.has(i) && s.data.length===0);
      if(slot === -1){
        // expand if below maxSeries
        if(this.series.length < this.maxSeries){
          const palette = ['#60a5fa','#a78bfa','#34d399','#f59e0b','#ef4444','#10b981','#0ea5e9','#6366f1','#d946ef'];
          this.series.push({col: palette[this.series.length % palette.length], data: []});
          slot = this.series.length -1;
        } else return; // cannot add more
      }
      this.seriesMap.set(n, slot);
    });
  }
  pushValue(name, t, v){
    // t (ms?) kontrol: eğer çok büyükse (ör: 1690000000000) saniyeye çevir
    if(t > 3e9) t = t/1000; // 2065 yılına kadar güvenli
    if(!this.seriesMap.has(name)){
      // Dinamik olarak eklenmiş olabilir
      this.ensureSeries([ ...this.seriesMap.keys(), name ]);
      if(!this.seriesMap.has(name)) return;
    }
    const idx = this.seriesMap.get(name);
    const s = this.series[idx];
    s.data.push({t:+t,v:+v});
    // trim old
    const cutoff = t - this.windowSec;
    let firstValid = s.data.findIndex(p=>p.t>=cutoff);
    if(firstValid>0) s.data.splice(0, firstValid-1); // keep one before for continuity
    if(s.data.length>10000) s.data.splice(0, s.data.length-8000);
  // x aralığını güncelle
  if(!this.xmax || t > this.xmax) this.xmax = t;
  this.xmin = this.xmax - this.windowSec;
  }
  draw(){
    this.ctx = ctx2d(this.c); const ctx=this.ctx, r=this.c.getBoundingClientRect();
    const W=r.width, H=r.height; ctx.clearRect(0,0,W,H);
    if(this.xmax <= this.xmin){
      this.xmax = now();
      this.xmin = this.xmax - this.windowSec;
    }
    // compute range across active series
    let y0=Infinity,y1=-Infinity; const activeIdxs=new Set(this.seriesMap.values());
    if(activeIdxs.size===0){
      // sadece boş eksen çiz ve mesaj göster
      ctx.strokeStyle='#1f2430'; ctx.beginPath(); ctx.moveTo(this.pad.l,this.pad.t); ctx.lineTo(this.pad.l,H-this.pad.b); ctx.lineTo(W-this.pad.r,H-this.pad.b); ctx.stroke();
      ctx.fillStyle='#475569'; ctx.font='12px "Inter",system-ui,sans-serif';
      ctx.textAlign='center'; ctx.fillText('No signals selected', W/2, H/2 - 6);
      ctx.fillText('Sinyal çiplerine tıklayın veya DBC decode etkin olsun', W/2, H/2 + 10);
      return;
    }
    for(const idx of activeIdxs){ const s=this.series[idx]; for(const p of s.data){ if(p.t>=this.xmin && p.t<=this.xmax){ if(p.v<y0)y0=p.v; if(p.v>y1)y1=p.v; } } }
    if(!isFinite(y0)){ y0=0; y1=1; } if(y0===y1){ y0-=1; y1+=1; }
    // axes
    ctx.strokeStyle='#1f2430'; ctx.beginPath(); ctx.moveTo(this.pad.l,this.pad.t); ctx.lineTo(this.pad.l,H-this.pad.b); ctx.lineTo(W-this.pad.r,H-this.pad.b); ctx.stroke();
    ctx.strokeStyle='#151b24'; ctx.fillStyle='#b7c0cd'; ctx.font='11px "Inter","Segoe UI",system-ui,sans-serif';
    for(let i=0;i<=5;i++){ const v=y0+(y1-y0)*i/5; const py=this._y(v,y0,y1); ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke(); ctx.fillText(v.toFixed(0),10,py+4); }
    // draw each series area then line
    for(const [name, idx] of this.seriesMap.entries()){
      const s=this.series[idx]; if(!s) continue; ctx.lineWidth=this.lineWidth; let started=false; let firstX=null,lastX=null; let lastY=null;
      // build path
      ctx.beginPath();
      for(const p of s.data){ if(p.t<this.xmin || p.t>this.xmax) continue; const xx=this._x(p.t); const yy=this._y(p.v,y0,y1); if(firstX==null) firstX=xx; lastX=xx; lastY=yy; if(!started){ ctx.moveTo(xx,yy); started=true;} else ctx.lineTo(xx,yy);}    
      if(started){
        // fill
        ctx.lineTo(lastX, H-this.pad.b);
        ctx.lineTo(firstX, H-this.pad.b);
        ctx.closePath();
        const col = s.col;
        const rgbMatch = col.startsWith('#')? col.match(/#([0-9a-f]{6})/i): null;
        let fill = col;
        if(rgbMatch){
          const hex=rgbMatch[1]; const rP=parseInt(hex.slice(0,2),16), gP=parseInt(hex.slice(2,4),16), bP=parseInt(hex.slice(4,6),16);
          fill = `rgba(${rP},${gP},${bP},${this.alpha})`;
        } else fill = 'rgba(96,165,250,'+this.alpha+')';
        ctx.fillStyle=fill; ctx.strokeStyle=s.col; ctx.fill();
        // redraw line path
        ctx.beginPath(); started=false; for(const p of s.data){ if(p.t<this.xmin || p.t>this.xmax) continue; const xx=this._x(p.t), yy=this._y(p.v,y0,y1); if(!started){ ctx.moveTo(xx,yy); started=true; } else ctx.lineTo(xx,yy);} ctx.strokeStyle=s.col; ctx.stroke();
      }
    }
    // legend (active)
    const names=[...this.seriesMap.keys()]; if(names.length){
      ctx.font='11px "Inter","Segoe UI",system-ui,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
      let x=this.pad.l+4; let y=this.pad.t+4; const lineH=16;
      for(const n of names){ const idx=this.seriesMap.get(n); const s=this.series[idx]; const box=12; ctx.fillStyle=s.col; ctx.fillRect(x,y,box,box); ctx.strokeStyle='#0f172a'; ctx.strokeRect(x,y,box,box); ctx.fillStyle='#cbd5e1'; ctx.fillText(n, x+box+6, y+box/2); y+=lineH; }
    }
  }
}
