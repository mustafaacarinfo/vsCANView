import { now } from './core/chartCore.js';
export function seedAll({speed,rpm,gps,pressure,fuelRate,fuelGauge,tGauges}){
  const t = now();
  // speed
  (function(){ let v=0; for(let s=0;s<60*40;s+=5){ v = Math.max(0, Math.min(110, v+(Math.random()-0.5)*3 + Math.max(0, (Math.random()-0.5)*1.2))); speed.pushSample(t-60*40+s, v); } speed.draw(); })();
  // rpm
  (function(){ let v=800; for(let s=0;s<60*20;s+=2){ v=Math.max(700, Math.min(3800, v+(Math.random()-0.5)*120 + (Math.random()<0.01?800:0))); rpm.pushSample(t-60*20+s, v);} rpm.draw(); })();
  // gps
  (function(){ let la=41.01, lo=28.97; const pts=[]; for(let i=0;i<120;i++){ lo+=(Math.random()*2-1)*0.02; la+=(Math.random()*2-1)*0.01; pts.push({lat:la,lon:lo}); } gps.setPoints(pts); })();
  // pressure
  (function(){ let v=300; for(let s=0;s<60*20;s+=3){ v=Math.max(200, Math.min(650, v+(Math.random()-0.5)*15)); pressure.pushSample(t-60*20+s, v);} pressure.draw(); })();
  // fuel rate
  (function(){ let v=22; for(let s=0;s<60*20;s+=3){ v=Math.max(10, Math.min(40, v+(Math.random()-0.5)*1.4)); fuelRate.pushSample(t-60*20+s, v);} fuelRate.draw(); })();
  // fuel gauge + temps
  fuelGauge.setValue(51);
  tGauges.setValues({coolant:90, oil:95, exhaust:320});
}
