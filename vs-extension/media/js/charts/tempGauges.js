import { ArcGauge } from './arcGauge.js';
export class TemperatureGauges {
  constructor(coolantCanvas, oilCanvas, exhaustCanvas){
    this.coolant = new ArcGauge(coolantCanvas,{min:60, max:120, value:90, unit:'°C', label:'coolant'});
    this.oil     = new ArcGauge(oilCanvas,    {min:60, max:140, value:95, unit:'°C', label:'oil'});
    this.exhaust = new ArcGauge(exhaustCanvas,{min:200, max:600, value:320, unit:'°C', label:'exhaust'});
  }
  setValues({coolant, oil, exhaust}){
    if(coolant!=null) this.coolant.setValue(coolant);
    if(oil!=null)     this.oil.setValue(oil);
    if(exhaust!=null) this.exhaust.setValue(exhaust);
  }
  draw(){ this.coolant.draw(); this.oil.draw(); this.exhaust.draw(); }
}
