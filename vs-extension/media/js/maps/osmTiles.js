
export class OSMCanvas {
  constructor(canvas){
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.zoom = 12; this.center = { lat: 41.0082, lon: 28.9784 };
    this.drag = null;
    canvas.addEventListener('wheel', (e)=>{ e.preventDefault(); this.zoom = Math.max(3, Math.min(19, this.zoom + (e.deltaY<0?1:-1))); this.draw(); });
    canvas.addEventListener('mousedown', (e)=>{ this.drag = {x:e.clientX,y:e.clientY, start: {...this.center} }; });
    window.addEventListener('mousemove', (e)=>{ if(!this.drag) return; const dx=e.clientX-this.drag.x, dy=e.clientY-this.drag.y; this.pan(dx,dy); this.draw(); });
    window.addEventListener('mouseup', ()=> this.drag=null);
  }
  lon2x(lon){ return (lon + 180) / 360; }
  lat2y(lat){ const s = Math.sin(lat * Math.PI/180); return 0.5 - Math.log((1+s)/(1-s))/(4*Math.PI); }
  x2lon(x){ return x*360 - 180; }
  y2lat(y){ const z = Math.PI*(1-2*y); return 180/Math.PI * Math.atan(0.5*(Math.exp(z)-Math.exp(-z))); }
  pan(dx, dy){
    const r=this.c.getBoundingClientRect(), n=Math.pow(2,this.zoom);
    const px = dx / r.width, py = dy / r.height;
    let x=this.lon2x(this.center.lon), y=this.lat2y(this.center.lat);
    x -= px; y -= py;
    this.center.lon = this.x2lon(x); this.center.lat = this.y2lat(y);
  }
  setCenter(lat, lon){ this.center = {lat,lon}; this.draw(); }
  async draw(){
    const r=this.c.getBoundingClientRect(); this.c.width=r.width*devicePixelRatio; this.c.height=r.height*devicePixelRatio;
    const ctx=this.ctx; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); ctx.clearRect(0,0,r.width,r.height);
    const z=this.zoom, n=Math.pow(2,z);
    let cx = this.lon2x(this.center.lon)*n, cy = this.lat2y(this.center.lat)*n;
    const tileSize=256;
    const startX = Math.floor(cx - r.width/(2*tileSize));
    const startY = Math.floor(cy - r.height/(2*tileSize));
    const endX = Math.floor(cx + r.width/(2*tileSize));
    const endY = Math.floor(cy + r.height/(2*tileSize));
    for(let x=startX;x<=endX;x++){
      for(let y=startY;y<=endY;y++){
        const u = ((x%n)+n)%n; const v=((y%n)+n)%n;
        const url = `https://tile.openstreetmap.org/${z}/${u}/${v}.png`;
        await this.drawTile(url, Math.round(r.width/2 + (x-cx)*tileSize), Math.round(r.height/2 + (y-cy)*tileSize), tileSize);
      }
    }
  }
  drawTile(url, x, y, s){
    return new Promise((res)=>{ const im=new Image(); im.crossOrigin='anonymous'; im.onload=()=>{ this.ctx.drawImage(im, x, y, s, s); res(); }; im.onerror=()=>res(); im.src=url; });
  }
}
