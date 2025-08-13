import { now } from './core/chartCore.js';
import { SpeedChart } from './charts/speedChart.js';
import { RpmChart }   from './charts/rpmChart.js';
import { GpsChart }   from './charts/gpsChart.js';
import { PressureChart } from './charts/pressureChart.js';
import { FuelRateChart } from './charts/fuelRateChart.js';
import { renderJSONTree } from './core/jsonTree.js';
import { VehicleViewer } from './three/vehicleViewer.js';
import { FuelGauge } from './charts/arcGauge.js';
import { TemperatureGauges } from './charts/tempGauges.js';

// Tabs
const tabs = document.querySelectorAll('.tab');
const pages = { dash: document.getElementById('page-dash'), feed: document.getElementById('page-feed') };
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  Object.values(pages).forEach(p => p.classList.remove('active'));
  pages[t.dataset.tab]?.classList.add('active');
  localStorage.setItem('can.tab', t.dataset.tab);
}));
const savedTab = localStorage.getItem('can.tab'); if(savedTab && pages[savedTab]) document.querySelector(`.tab[data-tab="${savedTab}"]`)?.click();

// Chips persistence
['busSel','decodeSel','viewSel','rateSel','idFilter'].forEach(id=>{
  const el = document.getElementById(id);
  const key = 'can.'+id;
  const v = localStorage.getItem(key);
  if(v != null) el.value = v;
  el.addEventListener('change',()=>localStorage.setItem(key, el.value));
});
const decodeSel = document.getElementById('decodeSel');
const signalSel = document.getElementById('signalSel');
decodeSel.addEventListener('change',()=>{ signalSel.disabled = decodeSel.value !== 'DBC'; });

document.getElementById('pauseBtn').addEventListener('click', (e)=>{
  paused = !paused; e.currentTarget.textContent = paused ? '▶ Resume' : '⏸ Pause';
});

// Status counters
let total = 0, tickCount=0, paused=false;
const connDot = document.getElementById('connDot'); const connTxt = document.getElementById('connTxt');
const mpsEl = document.getElementById('mps'); const totalEl = document.getElementById('total'); const lastTopicEl = document.getElementById('lastTopic');
setInterval(()=>{ mpsEl.textContent = tickCount.toString(); tickCount=0; }, 1000);

// Charts
const speed = new SpeedChart(document.getElementById('speed'));
const rpm   = new RpmChart(document.getElementById('rpm'));
const gps   = new GpsChart(document.getElementById('map'));
const pressure = new PressureChart(document.getElementById('pressure'));
const fuelRate = new FuelRateChart(document.getElementById('fuelRate'));
const fuelGauge = new FuelGauge(document.getElementById('fuel'));
const tGauges = new TemperatureGauges(document.getElementById('gCoolant'), document.getElementById('gOil'), document.getElementById('gExhaust'));

// Demo seeds
import('./seed.mjs').then(m=>m.seedAll({speed,rpm,gps,pressure,fuelRate,fuelGauge,tGauges}));

// 3D viewer (model in media/vehicle.glb)
const viewer = new VehicleViewer(document.getElementById('vehicleCanvas'), document.getElementById('vehicleNotice'), '__VEHICLE_URI__'); viewer.init();

// Feed
const feedEl = document.getElementById('feed');
const feedArr = [];
function pushFeed(topic, payload){
  const row = document.createElement('div'); row.className='row';
  const ts = new Date().toLocaleTimeString();
  const cTime = document.createElement('div'); cTime.textContent = ts;
  const cTopic = document.createElement('div'); cTopic.className = 'topic'; cTopic.textContent = topic;
  const cJson = document.createElement('div'); const holder=document.createElement('div'); renderJSONTree(holder, payload); cJson.appendChild(holder);
  row.appendChild(cTime); row.appendChild(cTopic); row.appendChild(cJson); feedEl.prepend(row);
  feedArr.push({ts, topic, payload}); while(feedEl.childElementCount > 400) feedEl.removeChild(feedEl.lastChild);
}
document.getElementById('clearFeed').addEventListener('click', ()=>{ feedEl.innerHTML=''; feedArr.length=0; });
document.getElementById('exportFeed').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(feedArr, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='can-feed.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
});

// MQTT bridge
window.addEventListener('message', (ev) => {
  const msg = ev.data; if(!msg) return;
  if(msg.type === 'conn'){ const ok = !!msg.ok; connDot.className='dot '+(ok?'ok':'fail'); connTxt.textContent = ok?'Connected':'Disconnected'; return; }
  if(msg.type === 'can' && !paused){
    const { topic, payload } = msg;
    const t = (payload.t) ? +payload.t : now();
    total++; tickCount++; totalEl.textContent = total.toString(); lastTopicEl.textContent = topic;

    if(/speed/i.test(topic) && typeof payload.speedKmh === 'number') { speed.pushSample(t, +payload.speedKmh); speed.draw(); }
    if(/rpm/i.test(topic) && typeof payload.rpm === 'number') { rpm.pushSample(t, +payload.rpm); rpm.draw(); }
    if(payload.kpa != null) { pressure.pushSample(t, +payload.kpa); pressure.draw(); }
    if(payload.lph != null) { fuelRate.pushSample(t, +payload.lph); fuelRate.draw(); }
    if(payload.coolant!=null || payload.oil!=null || payload.exhaust!=null){
      tGauges.setValues({coolant: payload.coolant, oil: payload.oil, exhaust: payload.exhaust});
    }
    if(payload.fractionFuel != null){ fuelGauge.setValue(+payload.fractionFuel*100); }
    if(payload.gps && payload.gps.lat != null && payload.gps.lon != null){
      gps.setPoints([...(gps.points||[]), {lat:+payload.gps.lat, lon:+payload.gps.lon}]);
    }
    pushFeed(topic, payload);
  }
});

// Resize
window.addEventListener('resize', () => { speed.draw(); rpm.draw(); gps.draw(); pressure.draw(); fuelRate.draw(); fuelGauge.draw(); tGauges.draw(); });
