import { LineChart, now } from '../core/chartCore.js';

export class FuelRateChart extends LineChart {
  constructor(canvas) {
  super(canvas, '#f59e0b', { tightY:true, smoothingFactor:0.25, showLastTimestamp:false, liveMode:true, targetFps:60,
    referenceLines:[{ value:10, label:'10', color:'#64748b', dash:[6,4] }], autoMidline:true, showTimeAxis:true, timeAxisFormat:'HH:MM' });
    this.points = [];
    this.setRange(now()-60, now());
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
