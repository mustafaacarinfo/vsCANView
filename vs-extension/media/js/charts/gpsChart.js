import { ctx2d } from '../core/chartCore.js';
export class GpsChart { constructor(c){ this.canvas=c; this.ctx=ctx2d(c); this.points=[]; window.addEventListener('resize',()=>this.ctx=ctx2d(this.canvas)); }
  setPoints(p){ this.points=p||[]; this.draw(); }
  draw(){ this.ctx=ctx2d(this.canvas); const el=this.canvas, ctx=this.ctx; const r=el.getBoundingClientRect(); const W=r.width,H=r.height,pad=20;
    ctx.clearRect(0,0,W,H); if(!this.points.length){ ctx.fillStyle='#b7c0cd'; ctx.fillText('GPS verisi yok',10,18); return; }
    const lats=this.points.map(p=>p.lat), lons=this.points.map(p=>p.lon);
    const minLat=Math.min(...lats), maxLat=Math.max(...lats), minLon=Math.min(...lons), maxLon=Math.max(...lons);
    const X=lon=>pad+(lon-minLon)*(W-2*pad)/(maxLon-minLon||1), Y=lat=>H-pad-(lat-minLat)*(H-2*pad)/(maxLat-minLat||1);
    ctx.strokeStyle='#151b24'; for(let i=0;i<=6;i++){ const px=pad+i*(W-2*pad)/6; ctx.beginPath(); ctx.moveTo(px,pad); ctx.lineTo(px,H-pad); ctx.stroke(); }
    for(let i=0;i<=4;i++){ const py=pad+i*(H-2*pad)/4; ctx.beginPath(); ctx.moveTo(pad,py); ctx.lineTo(W-pad,py); ctx.stroke(); }
    ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(X(this.points[0].lon), Y(this.points[0].lat));
    for(let i=1;i<this.points.length;i++){ ctx.lineTo(X(this.points[i].lon), Y(this.points[i].lat)); } ctx.stroke();
    ctx.fillStyle='#34d399'; const s=this.points[0]; ctx.beginPath(); ctx.arc(X(s.lon),Y(s.lat),3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ef4444'; const e=this.points[this.points.length-1]; ctx.beginPath(); ctx.arc(X(e.lon),Y(e.lat),3,0,Math.PI*2); ctx.fill(); }
  static randomRoute(n=60){ let la=41.01, lo=28.97; const out=[]; for(let i=0;i<n;i++){ lo+=(Math.random()*2-1)*0.02; la+=(Math.random()*2-1)*0.01; out.push({lat:la,lon:lo}); } return out; } }
