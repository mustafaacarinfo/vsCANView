import { LineChart, now } from '../core/chartCore.js';

export class SpeedChart extends LineChart {
  constructor(canvas) {
    super(canvas, '#60a5fa');
    this.points = [];
    this.setRange(now()-60, now());
  }
  
  pushSample(t, v) {
    this.push(t, v);
    this.points.push({t, v});
    
    // Keep reasonable amount of data in memory
    if (this.points.length > 500) {
      this.points = this.points.slice(-500);
    }
    
    // Adjust time window
    this.setRange(t-60, t);
  }
  
  // Proper implementation of clearData
  clearData() {
    // Clear underlying chart data
    this.data = [];
    this.points = [];
    
    // Set initial empty state with current time range
    const currentTime = now();
    this.push(currentTime-60, 0);
    this.push(currentTime, 0);
    this.setRange(currentTime-60, currentTime);
  }
}
