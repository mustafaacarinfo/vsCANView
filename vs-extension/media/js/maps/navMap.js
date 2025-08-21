import { OSMCanvas } from './osmTiles.js';

// Basit navigation wrapper: GPS chart noktalarını da overlay eder
export class NavMap {
  constructor(canvas){
    this.osm = new OSMCanvas(canvas);
    this.points = [];
  }
  setPoints(pts){ this.points = pts; this.drawOverlay(); }
  setCenter(lat,lon){ this.osm.setCenter(lat,lon); }
  draw(){ this.osm.draw().then(()=>this.drawOverlay()); }
  drawOverlay(){
    const c = this.osm.c; const ctx = this.osm.ctx; if(!ctx) return;
    const r=c.getBoundingClientRect(); ctx.save();
    // Basit projected noktalar (aynı mercator fonksiyonlarını kullan)
    const z = this.osm.zoom; const n=Math.pow(2,z); const tileSize=256;
    const centerX = this.osm.lon2x(this.osm.center.lon)*n; const centerY=this.osm.lat2y(this.osm.center.lat)*n;
    this.points.slice(-500).forEach(p=>{
      const px = this.osm.lon2x(p.lon)*n; const py=this.osm.lat2y(p.lat)*n;
      const dx = (px-centerX)*tileSize + r.width/2;
      const dy = (py-centerY)*tileSize + r.height/2;
      ctx.beginPath(); ctx.fillStyle='#60a5fa'; ctx.arc(dx,dy,4,0,Math.PI*2); ctx.fill();
    });
    ctx.restore();
  }
}
