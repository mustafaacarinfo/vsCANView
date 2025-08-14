import { LineChart, now } from '../core/chartCore.js';

export class RpmChart extends LineChart {
  constructor(canvas) {
    super(canvas, '#a78bfa');
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
