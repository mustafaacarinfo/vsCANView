export class OSMCanvas {
  constructor(canvas){
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.zoom = 12; this.center = { lat: 41.0082, lon: 28.9784 };
    this.drag = null;
    this.tileCache = new Map(); // key -> HTMLImageElement
    this.fetchQueue = new Set();
    this.lastPanTime = 0; // Throttling için
    this.pendingDraw = false; // Draw throttling
    
    canvas.addEventListener('wheel', (e)=>{
      e.preventDefault(); 
      this.zoom = Math.max(3, Math.min(19, this.zoom + (e.deltaY<0?1:-1))); 
      this.throttledDraw();
    });
    
    canvas.addEventListener('mousedown', (e)=>{ 
      this.drag = {x:e.clientX, y:e.clientY, startTime: Date.now()}; 
    });
    
    window.addEventListener('mousemove', (e)=>{ 
      if(!this.drag) return; 
      
      // Throttling - 33ms'den sık güncelleme yapma (30fps limit)
      const now = Date.now();
      if(now - this.lastPanTime < 33) return;
      this.lastPanTime = now;
      
      // Hareket mesafesini sınırla
      const maxMove = 5; // Maksimum piksel hareketi
      let dx = e.clientX - this.drag.x;
      let dy = e.clientY - this.drag.y;
      
      // Büyük hareketleri sınırla
      dx = Math.max(-maxMove, Math.min(maxMove, dx));
      dy = Math.max(-maxMove, Math.min(maxMove, dy));
      
      // Hassasiyet azaltma - çok daha yavaş
      dx *= 0.05; // %5 hassasiyet
      dy *= 0.05; // %5 hassasiyet
      
      this.drag.x = e.clientX; 
      this.drag.y = e.clientY; 
      this.pan(dx, dy); 
      this.throttledDraw(); 
    });
    
    window.addEventListener('mouseup', ()=> this.drag=null);
  }
  
  // Throttled draw function
  throttledDraw() {
    if (this.pendingDraw) return;
    this.pendingDraw = true;
    requestAnimationFrame(() => {
      this.draw();
      this.pendingDraw = false;
    });
  }
  // Mercator helpers
  lon2x(lon){ return (lon + 180) / 360; }
  lat2y(lat){ const s = Math.sin(lat * Math.PI/180); return 0.5 - Math.log((1+s)/(1-s))/(4*Math.PI); }
  x2lon(x){ return x*360 - 180; }
  y2lat(y){ const z = Math.PI*(1-2*y); return 180/Math.PI * Math.atan(0.5*(Math.exp(z)-Math.exp(-z))); }
  pan(dx, dy){
    const r=this.c.getBoundingClientRect(), n=Math.pow(2,this.zoom);
    if(r.width===0||r.height===0) return;
    
    // Zoom seviyesine göre hassasiyet ayarla
    // Düşük zoom (uzak görünüm) = daha az hassas
    // Yüksek zoom (yakın görünüm) = daha hassas
    const zoomFactor = Math.pow(2, Math.max(0, this.zoom - 8)) / 100; // Çok düşük hassasiyet
    
    const px = (dx / r.width) * zoomFactor; 
    const py = (dy / r.height) * zoomFactor;
    
    let x=this.lon2x(this.center.lon), y=this.lat2y(this.center.lat);
    x -= px; y -= py;
    
    // Koordinatları sınırla (Mercator projeksiyonu limitleri)
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    
    this.center.lon = this.x2lon(x); 
    this.center.lat = this.y2lat(y);
    
    // Lat/Lon sınırları
    this.center.lat = Math.max(-85, Math.min(85, this.center.lat));
    this.center.lon = Math.max(-180, Math.min(180, this.center.lon));
  }
  setCenter(lat, lon){
    if(!isFinite(lat) || !isFinite(lon)) return; // guard
    // Mercator limitleri (±85)
    lat = Math.max(-85, Math.min(85, lat));
    lon = ((lon+180)%360+360)%360 -180; // wrap
    this.center = {lat,lon}; this.draw();
  }
  async draw(){
    const r=this.c.getBoundingClientRect();
    if(r.width===0||r.height===0) return;
    
    // Canvas boyutunu device pixel ratio ile ayarla ama sınırla
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.c.width=r.width*dpr; 
    this.c.height=r.height*dpr;
    
    const ctx=this.ctx; 
    ctx.setTransform(dpr,0,0,dpr,0,0); 
    ctx.clearRect(0,0,r.width,r.height);
    ctx.fillStyle='#0f1620'; 
    ctx.fillRect(0,0,r.width,r.height);
    
    const z=this.zoom, n=Math.pow(2,z);
    if(!isFinite(this.center.lat) || !isFinite(this.center.lon)) return;
    
    const cx = this.lon2x(this.center.lon)*n, cy = this.lat2y(this.center.lat)*n;
    const tileSize=256;
    const startX = Math.floor(cx - r.width/(2*tileSize));
    const startY = Math.floor(cy - r.height/(2*tileSize));
    const endX = Math.floor(cx + r.width/(2*tileSize));
    const endY = Math.floor(cy + r.height/(2*tileSize));

    const promises = [];
    for(let x=startX;x<=endX;x++){
      for(let y=startY;y<=endY;y++){
        const u = ((x%n)+n)%n; const v=((y%n)+n)%n;
        const key = `${z}/${u}/${v}`;
        const drawX = Math.round(r.width/2 + (x-cx)*tileSize);
        const drawY = Math.round(r.height/2 + (y-cy)*tileSize);
        const img = this.tileCache.get(key);
        if (img && img.complete && img.naturalWidth) {
          ctx.drawImage(img, drawX, drawY, tileSize, tileSize);
        } else {
          // Placeholder
          ctx.fillStyle = '#12202c';
          ctx.fillRect(drawX, drawY, tileSize, tileSize);
          ctx.strokeStyle='#1d2c38'; ctx.lineWidth=1; ctx.strokeRect(drawX+0.5, drawY+0.5, tileSize-1, tileSize-1);
          promises.push(this.fetchTile(key, drawX, drawY, tileSize, ctx));
        }
      }
    }
    if(promises.length){ 
      Promise.allSettled(promises).then(()=>{ 
        this.drawAttribution(ctx, r); 
      }); 
    } else {
      this.drawAttribution(ctx, r);
    }
  }
  fetchTile(key, x, y, s, ctx){
    if(this.fetchQueue.has(key)) return Promise.resolve();
    this.fetchQueue.add(key);
    return new Promise(res=>{
      const img = new Image();
      img.loading = 'eager';
      img.decoding = 'async';
      // Referrer ve crossOrigin ayarı (CORS header olmadığı için canvas taint sorun değil; piksel okunmayacak)
      img.referrerPolicy = 'no-referrer';
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.tileCache.set(key, img);
        this.fetchQueue.delete(key);
        try { ctx.drawImage(img, x, y, s, s); } catch{}
        res();
      };
      img.onerror = () => { this.fetchQueue.delete(key); res(); };
      img.src = `https://tile.openstreetmap.org/${key}.png`;
    });
  }
  drawAttribution(ctx, r){
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='10px "Inter","Segoe UI",system-ui,sans-serif'; ctx.textAlign='right'; ctx.textBaseline='bottom';
    ctx.fillText('© OpenStreetMap contributors', r.width-6, r.height-4);
  }
}
