import { ctx2d, clamp } from '../core/chartCore.js';
export class ArcGauge {
  constructor(canvas, {min=0, max=100, value=0, unit='%', bands=[{t:0.33,col:'#ef4444'},{t:0.66,col:'#f59e0b'},{t:1,col:'#34d399'}], label='' } = {}){
    this.c=canvas; this.ctx=ctx2d(canvas);
    this.min=min; this.max=max; this.value=value; this.unit=unit; this.bands=bands; this.label=label;
    window.addEventListener('resize',()=>this.ctx=ctx2d(this.c));
  }
  setValue(v){ this.value = v; this.draw(); }
  draw(){
    this.ctx=ctx2d(this.c); const ctx=this.ctx, r=this.c.getBoundingClientRect(), W=r.width,H=r.height;
    const cx=W/2, cy=H*0.95, R=Math.min(W, H*1.6)/2 - 10; const start=Math.PI, end=0; ctx.clearRect(0,0,W,H);
    // background
    ctx.lineCap='round'; ctx.lineWidth=14; ctx.strokeStyle='#1f2430'; ctx.beginPath(); ctx.arc(cx,cy,R,start,end); ctx.stroke();
    // value arc
    const frac = clamp((this.value - this.min)/(this.max - this.min || 1), 0, 1);
    ctx.strokeStyle='#93c5fd'; ctx.beginPath(); ctx.arc(cx,cy,R,start + (end-start)*0, start + (end-start)*frac); ctx.stroke();
    // text
    ctx.fillStyle='#e5e7eb'; ctx.font='20px ui-sans-serif'; ctx.textAlign='center';
    ctx.fillText(Math.round(this.value)+this.unit, cx, cy-R-6);
    if(this.label){ ctx.fillStyle='#b7c0cd'; ctx.font='12px ui-sans-serif'; ctx.fillText(this.label, cx, cy-4); }
    // colored band overlay (thin line to hint safe/med/high)
    const bands=this.bands; ctx.lineWidth=6;
    let prev=0; for(const b of bands){ ctx.strokeStyle=b.col; ctx.beginPath(); ctx.arc(cx,cy,R,start+(end-start)*prev, start+(end-start)*b.t); ctx.stroke(); prev=b.t; }
  }
}
export class FuelGauge extends ArcGauge { constructor(c){ super(c,{min:0,max:100,value:51,unit:'%',label:'fuel'}); } }
