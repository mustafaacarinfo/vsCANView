export function ctx2d(canvas){
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width  * dpr));
  const H = Math.max(1, Math.round(r.height * dpr));
  if(canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
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
    window.addEventListener('resize', () => this.ctx = ctx2d(this.c));
  }
  setRange(a,b){ this.xmin=a; this.xmax=b; }
  push(t,v){ this.data.push({t:+t,v:+v}); if(this.data.length>20000) this.data.splice(0,this.data.length-20000); }
  _x(t){ const w=this.c.getBoundingClientRect().width - this.pad.l - this.pad.r; return this.pad.l + (t-this.xmin)*w/(this.xmax-this.xmin || 1); }
  _y(v,y0,y1){ const h=this.c.getBoundingClientRect().height - this.pad.t - this.pad.b; return this.pad.t + (y1-v)*h/(y1-y0 || 1); }
  draw(){
    this.ctx = ctx2d(this.c);
    const ctx=this.ctx, r=this.c.getBoundingClientRect(), W=r.width, H=r.height;
    ctx.clearRect(0,0,W,H);
    let y0=Infinity,y1=-Infinity;
    for(const p of this.data){ if(p.t>=this.xmin && p.t<=this.xmax){ if(p.v<y0)y0=p.v; if(p.v>y1)y1=p.v; } }
    if(!isFinite(y0)){ y0=0; y1=1; } if(y0===y1){ y0-=1; y1+=1; }

    ctx.strokeStyle='#1f2430'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(this.pad.l,this.pad.t); ctx.lineTo(this.pad.l,H-this.pad.b); ctx.lineTo(W-this.pad.r,H-this.pad.b); ctx.stroke();

    ctx.strokeStyle='#151b24'; ctx.fillStyle='#b7c0cd'; ctx.font='11px ui-sans-serif';
    for(let i=0;i<=5;i++){ const v=y0+(y1-y0)*i/5; const py=this._y(v,y0,y1);
      ctx.beginPath(); ctx.moveTo(this.pad.l,py); ctx.lineTo(W-this.pad.r,py); ctx.stroke();
      ctx.fillText(v.toFixed(0),6,py+3);
    }

    ctx.strokeStyle=this.col; ctx.lineWidth=1.6; ctx.beginPath();
    let started=false;
    for(const p of this.data){ if(p.t<this.xmin || p.t>this.xmax) continue; const xx=this._x(p.t), yy=this._y(p.v,y0,y1);
      if(!started){ ctx.moveTo(xx,yy); started=true; } else ctx.lineTo(xx,yy); } ctx.stroke();
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
