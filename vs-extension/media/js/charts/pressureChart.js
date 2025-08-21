import { LineChart, now } from '../core/chartCore.js';

export class PressureChart extends LineChart {
  constructor(canvas) {
  super(canvas, '#34d399', { showLastTimestamp:false, referenceLines:[{ value:50, label:'50', color:'#64748b', dash:[6,4] }], autoMidline:true, showTimeAxis:true, timeAxisFormat:'HH:MM' });
    this.points = [];
    this.setRange(now()-60, now());
  }
  
  pushSample(t, v) {
    this.push(t, v);
    this.points.push({t, v});
    
    if (this.points.length > 500) {
      this.points = this.points.slice(-500);
    }
    
    this.setRange(t-60, t);
  }
  
  // ADD MISSING clearData method
  clearData() {
    this.data = [];
    this.points = [];
    
    const currentTime = now();
    this.push(currentTime-60, 0);
    this.push(currentTime, 0);
    this.setRange(currentTime-60, currentTime);
  }
}
