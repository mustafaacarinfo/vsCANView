import { LineChart, now, ctx2d } from '../core/chartCore.js';

export class FuelRateChart extends LineChart {
  constructor(canvas) {
  super(canvas, '#f59e0b', { tightY:true, smoothingFactor:0.25, showLastTimestamp:false, liveMode:true, targetFps:60,
    referenceLines:[{ value:10, label:'10', color:'#64748b', dash:[6,4] }], autoMidline:true, showTimeAxis:true, timeAxisFormat:'HH:MM' });
    this.points = [];
    this.setRange(now()-60, now());
  
  // Dynamic right padding to prevent overlap with fuel gauge
  // Adjust based on container width for better responsiveness
  this._updatePadding = () => {
    try {
      const container = this.c.closest('.fuel-rate');
      if (container) {
        const containerWidth = container.getBoundingClientRect().width;
        // More padding needed on smaller containers
        const dynamicPadding = containerWidth < 300 ? 80 : containerWidth < 400 ? 70 : 60;
        this.pad.r = Math.max(this.pad.r || 20, dynamicPadding);
      } else {
        this.pad.r = Math.max(this.pad.r || 20, 60);
      }
    } catch(e) {
      this.pad.r = Math.max(this.pad.r || 20, 60);
    }
  };
  
  this._updatePadding();
  
    // Robustness: observe resize/visibility changes and ensure backing-store is synced
    try {
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => {
          try { 
            this._updatePadding(); // Update padding on resize
            ctx2d(this.c); 
          } catch(e){}
          try { this._cached = {}; this.draw(); } catch(e){}
        });
        // observe the canvas and its container
        this._ro.observe(this.c);
        if (this.c.parentElement) this._ro.observe(this.c.parentElement);
      }
    } catch(e) {}

    // Also handle fullscreen/visibility events as fallback
    const ensure = () => { 
      try { 
        this._updatePadding(); // Update padding on visibility change
        ctx2d(this.c); 
        this._cached = {}; 
        this.draw(); 
      } catch(e){} 
    };
    document.addEventListener('fullscreenchange', ensure);
    document.addEventListener('webkitfullscreenchange', ensure);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ensure(); });
  }
  
  pushSample(t, v) {
    // İlk gerçek değer geldiğinde başlangıç tarihçesini düz çizgi yap
    if(!this._primed){
      this.data = [];
      this.points = [];
      this.push(t-60, v);
      this.push(t, v);
      this.points.push({t: t-60, v});
      this.points.push({t, v});
      this._primed = true;
      this.setRange(t-60, t);
      return;
    }

    this.push(t, v);
    this.points.push({t, v});

    if(this.data.length >= 2) {
      const first = this.data[0];
      const second = this.data[1];
      if(first.v === 0 && second.v > 0 && (second.t - first.t) > 2) {
        this.data.shift();
      }
    }
    
    if (this.points.length > 500) {
      this.points = this.points.slice(-500);
    }
    
    this.setRange(t-60, t);
  }
  
  clearData() {
    this.data = [];
    this.points = [];
  this._primed = false;
    
    const currentTime = now();
    this.push(currentTime-60, 0);
    this.push(currentTime, 0);
    this.setRange(currentTime-60, currentTime);
  }
}
