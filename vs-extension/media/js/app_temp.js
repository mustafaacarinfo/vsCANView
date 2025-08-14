import { now } from './core/chartCore.js';
import { SpeedChart } from './charts/speedChart.js';
import { RpmChart }   from './charts/rpmChart.js';
import { GpsChart }   from './charts/gpsChart.js';
import { PressureChart } from './charts/pressureChart.js';
import { FuelRateChart } from './charts/fuelRateChart.js';
import { renderJSONTree } from './core/jsonTree.js';
import { VehicleViewer } from './three/vehicleViewer_new.js';
import { FuelGauge } from './charts/arcGauge.js';
import { TemperatureGauges } from './charts/tempGauges.js';

// Tabs - performance optimized
const tabs = document.querySelectorAll('.tab');
const pages = { dash: document.getElementById('page-dash'), feed: document.getElementById('page-feed') };
let isTabSwitching = false;

tabs.forEach(t => t.addEventListener('click', () => {
  if (isTabSwitching) return; // Prevent new clicks during tab switching
  isTabSwitching = true;

  // Change active tab
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  
  // Switch pages - optimize browser rendering using RAF
  requestAnimationFrame(() => {
    Object.values(pages).forEach(p => p.classList.remove('active'));
    pages[t.dataset.tab]?.classList.add('active');
    localStorage.setItem('can.tab', t.dataset.tab);
    
    // Trigger resize for canvas elements on visible page
    if (t.dataset.tab === 'dash') {
      speed.draw();
      rpm.draw();
      gps.draw();
      pressure.draw(); 
      fuelRate.draw();
      fuelGauge.draw();
      tGauges.draw();
    }

    // Remove lock after operation is complete
    setTimeout(() => {
      isTabSwitching = false;
    }, 100);
  });
}));

// Load saved tab
const savedTab = localStorage.getItem('can.tab'); 
if(savedTab && pages[savedTab]) {
  // Switch to tab after page load (with delay)
  setTimeout(() => {
    document.querySelector(`.tab[data-tab="${savedTab}"]`)?.click();
  }, 100);
}

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

// Visibility tracking for performance optimization
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Reduce update frequency when page is hidden
    window.canAppHidden = true;
  } else {
    // Normal updates when page is visible
    window.canAppHidden = false;
    
    // Immediately update visible charts
    if (document.getElementById('page-dash').classList.contains('active')) {
      speed.draw();
      rpm.draw();
      gps.draw();
      pressure.draw(); 
      fuelRate.draw();
      fuelGauge.draw();
      tGauges.draw();
    }
  }
});

// Status counters
let total = 0, tickCount=0, paused=false;
const mqttDot = document.getElementById('mqttDot');
const canDot = document.getElementById('canDot');
const connTxt = document.getElementById('connTxt');
const mpsEl = document.getElementById('mps'); 
const totalEl = document.getElementById('total'); 
const lastTopicEl = document.getElementById('lastTopic');

// MQTT and CAN connection status monitoring
let lastCanMsgTime = 0;
let mqttConnected = false;

// Update connection status every second
setInterval(() => { 
  mpsEl.textContent = tickCount.toString(); 
  
  // If no CAN message for 5 seconds, CAN connection might be lost
  const now = Date.now();
  if (now - lastCanMsgTime > 5000) {
    canDot.className = 'dot fail';
  }
  
  // Connection status text
  if (mqttConnected && (now - lastCanMsgTime < 5000)) {
    connTxt.textContent = 'Connected';
  } else if (mqttConnected) {
    connTxt.textContent = 'MQTT Connected, Waiting CAN';
  } else {
    connTxt.textContent = 'Disconnected';
  }
  
  tickCount = 0; 
}, 1000);

// Charts - lazy loading and performance tracking added
const chartInitTime = performance.now();

const speed = new SpeedChart(document.getElementById('speed'));
const rpm   = new RpmChart(document.getElementById('rpm'));
const gps   = new GpsChart(document.getElementById('map'));
const pressure = new PressureChart(document.getElementById('pressure'));
const fuelRate = new FuelRateChart(document.getElementById('fuelRate'));
const fuelGauge = new FuelGauge(document.getElementById('fuel'));
const tGauges = new TemperatureGauges(document.getElementById('gCoolant'), document.getElementById('gOil'), document.getElementById('gExhaust'));

// Function to clear all charts - COMPLETELY REWRITE THIS FUNCTION
function clearAllCharts() {
  
  try {
    // Clear all chart data with explicit calls
    if (speed && typeof speed.clearData === 'function') {
      speed.clearData();
    }
    
    if (rpm && typeof rpm.clearData === 'function') {
      rpm.clearData();
    }
    
    if (gps && typeof gps.clearData === 'function') {
      gps.clearData();
    }
    
    if (pressure && typeof pressure.clearData === 'function') {
      pressure.clearData();
    }
    
    if (fuelRate && typeof fuelRate.clearData === 'function') {
      fuelRate.clearData();
    }
    
    // Reset gauges to default values
    if (fuelGauge && typeof fuelGauge.setValue === 'function') {
      fuelGauge.setValue(50);
    }
    
    if (tGauges && typeof tGauges.clear === 'function') {
      tGauges.clear();
    }
    
    // Force immediate redraw of all charts
    setTimeout(() => {
      if (speed) speed.draw();
      if (rpm) rpm.draw();
      if (gps) gps.draw();
      if (pressure) pressure.draw();
      if (fuelRate) fuelRate.draw();
      if (fuelGauge) fuelGauge.draw();
      if (tGauges) tGauges.draw();
    }, 100);
    
  } catch (error) {
    console.error('Error clearing charts:', error);
  }
}

// Make sure the button event listener is properly attached
document.addEventListener('DOMContentLoaded', () => {
  const clearButton = document.getElementById('clearCharts');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      clearAllCharts();
    });
  } else {
    console.error('Clear button not found!');
  }
});

// Also add immediate listener in case DOM is already loaded
const clearButton = document.getElementById('clearCharts');
if (clearButton) {
  clearButton.removeEventListener('click', clearAllCharts); // Remove any existing
  clearButton.addEventListener('click', () => {
    clearAllCharts();
  });
}

// Schedule initial drawing of charts
requestAnimationFrame(() => {
  speed.draw();
  rpm.draw();
  gps.draw();
  pressure.draw(); 
  fuelRate.draw();
  fuelGauge.draw();
  tGauges.draw();
});

// Demo seeds
import('./seed.mjs').then(m=>m.seedAll({speed,rpm,gps,pressure,fuelRate,fuelGauge,tGauges}));

// 3D viewer - URI check and initialization
let vehicleUri = 'https://vscode-remote%2Bwsl-002bubuntu-002d18-002e04.vscode-resource.vscode-cdn.net/home/mustafa/C%2B%2B/vsCANView/vs-extension/media/vehicle.glb';
let viewer = null;

// Vehicle URI message check
if (vehicleUri && vehicleUri !== '__VEHICLE_URI__') {
  startVehicleViewer(vehicleUri);
} else {
  const noticeEl = document.getElementById('vehicleNotice');
  if (noticeEl) noticeEl.textContent = 'Loading vehicle model...';
}

function startVehicleViewer(uri) {
  // Model loading process starting - completely hide notice
  const noticeEl = document.getElementById('vehicleNotice');
  if (noticeEl) {
    noticeEl.textContent = '';
    noticeEl.style.display = 'none';
  }
  
  viewer = new VehicleViewer(
    document.getElementById('vehicleCanvas'), 
    document.getElementById('vehicleNotice'), 
    uri
  );
  viewer.init().then(() => {
    if (noticeEl) noticeEl.style.display = 'none';
  }).catch(err => {
    // Show only on error
    if (noticeEl) {
      noticeEl.textContent = 'Error: ' + err.message;
      noticeEl.style.display = 'block';
    }
  });
}

// Feed
const feedEl = document.getElementById('feed');
const feedArr = [];
// Feed DOM updates performance optimization
let feedUpdateScheduled = false;
let feedBuffer = [];

function pushFeed(topic, payload){
  const ts = new Date().toLocaleTimeString();
  
  // Add data to buffer first
  feedBuffer.push({ts, topic, payload});
  feedArr.push({ts, topic, payload});
  
  // Clean up excess data
  while(feedArr.length > 400) feedArr.shift();
  
  // If no update is scheduled, schedule one
  if (!feedUpdateScheduled) {
    feedUpdateScheduled = true;
    
    // Optimize DOM updates with requestAnimationFrame
    requestAnimationFrame(() => {
      // Add all buffered data
      const fragment = document.createDocumentFragment();
      
      // Add last 25 items (limit for performance)
      const itemsToAdd = feedBuffer.slice(-25);
      
      for (const item of itemsToAdd) {
        const row = document.createElement('div');
        row.className = 'row';
        
        const cTime = document.createElement('div');
        cTime.textContent = item.ts;
        
        const cTopic = document.createElement('div');
        cTopic.className = 'topic';
        cTopic.textContent = item.topic;
        
        const cJson = document.createElement('div');
        const holder = document.createElement('div');
        renderJSONTree(holder, item.payload);
        cJson.appendChild(holder);
        
        row.appendChild(cTime);
        row.appendChild(cTopic);
        row.appendChild(cJson);
        
        fragment.prepend(row);
      }
      
      // Add fragment in one go
      feedEl.prepend(fragment);
      
      // Clean up excess DOM nodes
      while (feedEl.childElementCount > 400) {
        feedEl.removeChild(feedEl.lastChild);
      }
      
      // Clear buffer and reset scheduling state
      feedBuffer = [];
      feedUpdateScheduled = false;
    });
  }
}
document.getElementById('clearFeed').addEventListener('click', ()=>{ feedEl.innerHTML=''; feedArr.length=0; });
document.getElementById('exportFeed').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(feedArr, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='can-feed.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
});

// MQTT bridge - updated to also capture vehicleUri message
window.addEventListener('message', (ev) => {
  const msg = ev.data; if(!msg) return;
  
  // Vehicle URI message check
  if (msg.type === 'vehicleUri' && msg.uri) {
    if (!viewer) {
      // Hide text
      const noticeEl = document.getElementById('vehicleNotice');
      if (noticeEl) {
        noticeEl.textContent = '';
        noticeEl.style.display = 'none';
      }
      
      viewer = new VehicleViewer(
        document.getElementById('vehicleCanvas'), 
        document.getElementById('vehicleNotice'), 
        msg.uri
      );
      viewer.init().then(() => {
        if (noticeEl) noticeEl.style.display = 'none';
      }).catch(err => {
        console.error('VehicleViewer initialization error:', err);
        if (noticeEl) {
          noticeEl.textContent = 'Error: ' + err.message;
          noticeEl.style.display = 'block';
        }
      });
    }
    return;
  }
  
  if(msg.type === 'conn'){ 
    const ok = !!msg.ok; 
    mqttDot.className = 'dot ' + (ok ? 'ok' : 'fail');
    mqttConnected = ok;
    return; 
  }
  
  if(msg.type === 'can' && !paused){
    const { topic, payload } = msg;
    const t = (payload.t) ? +payload.t : now();
    total++; tickCount++; totalEl.textContent = total.toString(); lastTopicEl.textContent = topic;
    
    // CAN message received, update CAN connection
    lastCanMsgTime = Date.now();
    canDot.className = 'dot ok';

    // Check active tab
    const isActiveDashboard = document.getElementById('page-dash').classList.contains('active');
    let shouldDraw = isActiveDashboard && (tickCount % 2 === 0);
    
    // Process speed data
    if(/speed/i.test(topic) && typeof payload.speedKmh === 'number') { 
      speed.pushSample(t, +payload.speedKmh); 
      if (shouldDraw) speed.draw();
    } else if (payload.speed != null) {
      speed.pushSample(t, +payload.speed);
      if (shouldDraw) speed.draw();
    } else if (payload.velocity != null) {
      speed.pushSample(t, +payload.velocity);
      if (shouldDraw) speed.draw();
    }
    
    // Process RPM data
    if(/rpm/i.test(topic) && typeof payload.rpm === 'number') { 
      rpm.pushSample(t, +payload.rpm); 
      if (shouldDraw) rpm.draw();
    } else if (payload.engineRpm != null) {
      rpm.pushSample(t, +payload.engineRpm);
      if (shouldDraw) rpm.draw();
    }
    
    // Process other data
    if(payload.kpa != null) { 
      pressure.pushSample(t, +payload.kpa); 
      if (shouldDraw) pressure.draw();
    }
    if(payload.lph != null) { 
      fuelRate.pushSample(t, +payload.lph); 
      if (shouldDraw) fuelRate.draw();
    }
    if(payload.coolant!=null || payload.oil!=null || payload.exhaust!=null){
      const coolantVal = payload.coolant != null ? Math.max(0, Math.min(150, +payload.coolant)) : null;
      const oilVal = payload.oil != null ? Math.max(0, Math.min(150, +payload.oil)) : null;
      const exhaustVal = payload.exhaust != null ? Math.max(0, Math.min(800, +payload.exhaust)) : null;
      
      tGauges.setValues({
        coolant: coolantVal, 
        oil: oilVal, 
        exhaust: exhaustVal
      });
      if (shouldDraw) tGauges.draw();
    }
    if(payload.fractionFuel != null){ 
      const fuelPercent = Math.max(0, Math.min(100, +payload.fractionFuel * 100));
      fuelGauge.setValue(fuelPercent);
      if (shouldDraw) fuelGauge.draw();
    } else if (payload.fuel != null) {
      const fuelPercent = Math.max(0, Math.min(100, +payload.fuel));
      fuelGauge.setValue(fuelPercent);
      if (shouldDraw) fuelGauge.draw();
    }
    if(payload.gps && payload.gps.lat != null && payload.gps.lon != null){
      gps.setPoints([...(gps.points||[]), {lat:+payload.gps.lat, lon:+payload.gps.lon}]);
      if (shouldDraw) gps.draw();
    }
    
    // Add to feed if feed page is active or occasionally
    const isActiveFeed = document.getElementById('page-feed').classList.contains('active');
    if (isActiveFeed || tickCount % 3 === 0) {
      pushFeed(topic, payload);
    }
  }
});

// Resize - performance optimized
let resizeTimeout = null;
window.addEventListener('resize', () => { 
  // Optimize resize operations - prevent multiple calls
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
    if (activeTab === 'dash' || !activeTab) {
      // Trigger resize for canvas elements on visible page
      speed.draw(); 
      rpm.draw(); 
      gps.draw(); 
      pressure.draw(); 
      fuelRate.draw(); 
      fuelGauge.draw(); 
      tGauges.draw();
    }
    resizeTimeout = null;
  }, 250); // Merge resize events with 250ms delay
});
