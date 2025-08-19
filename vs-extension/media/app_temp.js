// Minimal self-contained solution to speed update problem

// Create standalone direct UI updater
(function installDirectUpdater() {
  console.log('🚀 Installing direct DOM updater...');
  
  // Create debug UI
  const debugContainer = document.createElement('div');
  debugContainer.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    background: #000;
    color: #0f0;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    border: 1px solid #0f0;
    z-index: 9999;
    max-width: 300px;
    max-height: 300px;
    overflow: auto;
  `;
  debugContainer.innerHTML = '<h4>CAN Debug</h4><div id="can-debug"></div>';
  document.body.appendChild(debugContainer);
  
  // Add direct DOM updater
  window.updateCAN = function(data) {
    // Log raw data
    const debugDiv = document.getElementById('can-debug');
    if (debugDiv) {
      const item = document.createElement('div');
      item.textContent = JSON.stringify(data);
      item.style.borderBottom = '1px solid #333';
      item.style.padding = '3px 0';
      debugDiv.insertBefore(item, debugDiv.firstChild);
      
      // Limit entries
      if (debugDiv.children.length > 10) {
        debugDiv.removeChild(debugDiv.lastChild);
      }
    }
    
    // Direct update speed elements
    if ('speed' in data) {
      const speedElements = [
        document.getElementById('speed'),
        document.getElementById('speed-value'),
        ...Array.from(document.querySelectorAll('[data-metric="speed"]'))
      ];
      
      // Update all speed elements
      speedElements.filter(Boolean).forEach(el => {
        if (el) {
          const formatted = typeof data.speed === 'number' ? 
            Math.round(data.speed) : data.speed;
          
          el.textContent = el.id === 'speed' ? 
            `${formatted} km/h` : formatted;
          
          // Highlight update
          el.style.transition = 'none';
          el.style.backgroundColor = '#ff06';
          setTimeout(() => {
            el.style.transition = 'background-color 0.5s';
            el.style.backgroundColor = 'transparent';
          }, 50);
        }
      });
    }

    // RPM extraction (multi-key)
    const rpmVal = data.rpm ??
                   (data.signals && (data.signals.EngineRPM || data.signals.EngineSpeed || data.signals.EngSpeed));
    if (rpmVal !== undefined) {
      const rpmNum = Number(rpmVal);
      const rpmEl = document.getElementById('rpm-value');
      if (rpmEl && !isNaN(rpmNum)) {
        rpmEl.textContent = `${Math.round(rpmNum)} RPM`;
        rpmEl.style.background = '#264653';
        setTimeout(()=> rpmEl.style.background = 'transparent', 300);
        console.log('[UI] Applied RPM value:', rpmNum);
      } else {
        console.warn('[UI] RPM element missing or invalid value:', rpmVal);
      }
    }
  };
  
  // Listen for messages from extension
  window.addEventListener('message', e => {
    const msg = e.data;
    if (!msg || !msg.command) return;
    
    if (msg.command === 'canData' && msg.data) {
      // Call our global updater
      window.updateCAN(msg.data);
      
      // Log to console for debugging
      console.log(`📥 CAN data received:`, msg.data);
    }
  });
  
  // Test with fake data on page load
  setTimeout(() => {
    const testSpeed = Math.floor(Math.random() * 200);
    console.log(`🧪 Testing with speed=${testSpeed}`);
    window.updateCAN({speed: testSpeed});
  }, 1000);
  
  console.log('✅ Direct DOM updater installed');
})();

// Existing code can stay, this runs independently

// Tab switching ve cross-tab veri paylaşımı için minimal çözüm

// Global state for cross-tab updates
window.canMetrics = {
  speed: 0,
  distance: 0,
  operationTime: 0,
  fuelRate: 0,
  fuelEco: 0
};

// Force update all metric displays regardless of active tab
function forceUpdateMetrics() {
  const metrics = window.canMetrics;
  
  // Speed updates - try all possible selectors
  const speedSelectors = [
    '#speed',
    '[data-metric="speed"]',
    '.metric-value[id="speed"]',
    '.speed-display'
  ];
  
  speedSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      if (el) {
        el.textContent = `${Math.round(metrics.speed)} km/h`;
        el.style.color = '#ff0'; // Highlight update
        setTimeout(() => el.style.color = '', 200);
      }
    });
  });
  
  // Other metrics
  const metricMap = {
    'distance': `${metrics.distance.toFixed(1)} km`,
    'operation-time': `${metrics.operationTime.toFixed(1)} h`, 
    'fuel-rate': `${metrics.fuelRate.toFixed(1)} l/h`,
    'fuel-eco': `${metrics.fuelEco.toFixed(1)} km/l`
  };
  
  Object.entries(metricMap).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      el.style.color = '#ff0';
      setTimeout(() => el.style.color = '', 200);
    }
  });

  const rpmEl = document.getElementById('rpm-value');
  if (rpmEl && window.lastRpmValue !== undefined) {
    rpmEl.textContent = `${Math.round(window.lastRpmValue)} RPM`;
  }
  
  console.log('📊 Force updated all metrics:', metrics);
}

// Tab switching handler
function initTabSwitching() {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;
      
      // Update active tab button
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      
      // Update active tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      const targetContent = document.getElementById(targetTab);
      if (targetContent) {
        targetContent.classList.add('active');
        
        // Force metrics update when switching to dashboard
        if (targetTab === 'dashboard-tab') {
          setTimeout(forceUpdateMetrics, 100);
        }
      }
    });
  });
}

// Enhanced message handler
window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg || !msg.command) return;
  
  if (msg.command === 'canData' && msg.data) {
    const data = msg.data;
    
    // Update global metrics state
    if ('speed' in data) window.canMetrics.speed = Number(data.speed) || 0;
    if ('distance' in data) window.canMetrics.distance = Number(data.distance) || 0;
    if ('operationTime' in data) window.canMetrics.operationTime = Number(data.operationTime) || 0;
    if ('fuelRate' in data) window.canMetrics.fuelRate = Number(data.fuelRate) || 0;
    if ('fuelEco' in data) window.canMetrics.fuelEco = Number(data.fuelEco) || 0;
    
    // Force update metrics in all tabs
    forceUpdateMetrics();
    
    // Also update CAN feed
    updateCanFeed(data);
    
    console.log('📥 Updated metrics:', window.canMetrics);
  }
});

// Dashboard ile entegrasyon: mesaj işleyicisi
window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg || !msg.command) return;
  
  if (msg.command === 'canData' && msg.data) {
    // Mevcut updateCAN fonksiyonunu çağır
    if (window.updateCAN) {
      window.updateCAN(msg.data);
    }
    
    // Dashboard sinyal işleyicisini bilgilendir
    // Bu otomatik olarak yapılıyor, çünkü VehicleDashboard da 'message' olayını dinliyor
  }

  if (msg.command === 'canData' && msg.data) {
    console.log('[RAW->UI] Incoming canData keys:', Object.keys(msg.data));
    if (msg.data.signals) {
      console.log('[RAW->UI] Signal keys:', Object.keys(msg.data.signals));
    }
  }
});

// Simplified CAN feed updater
function updateCanFeed(data) {
  const feed = document.getElementById('can-messages');
  if (!feed) return;
  
  const item = document.createElement('div');
  item.className = 'can-message';
  
  // Check if raw CAN frame
  const isRawFrame = data.raw && data.raw.includes('#');
  
  item.innerHTML = `
    <div class="message-header">
      <span class="timestamp">${new Date().toLocaleTimeString()}</span>
      <span class="message-id">${isRawFrame ? 'RAW' : 'JSON'} | ID: ${data.id}</span>
    </div>
    <div class="message-data">
      ${isRawFrame ? 
        `<strong>Frame:</strong> ${data.raw}<br><strong>Speed:</strong> ${data.speed} km/h` :
        `<pre>${JSON.stringify({speed: data.speed, distance: data.distance}, null, 2)}</pre>`
      }
    </div>
  `;
  
  feed.insertBefore(item, feed.firstChild);
  
  // Limit messages
  const messages = feed.querySelectorAll('.can-message');
  if (messages.length > 50) {
    messages[messages.length - 1].remove();
  }
}

// Initialize everything on DOM load
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing cross-tab CAN viewer...');
  
  initTabSwitching();
  
  // Test with initial values
  setTimeout(() => {
    window.canMetrics.speed = 42;
    forceUpdateMetrics();
  }, 500);
  
  console.log('✅ Cross-tab CAN viewer initialized');
});

// Debug helper - manual speed test
window.testSpeed = function(speed) {
  window.canMetrics.speed = speed;
  forceUpdateMetrics();
  console.log(`🧪 Test speed set to: ${speed}`);
};

// --- Simple Gauge Renderer (lightweight) ---
function drawSemiGauge(canvasId, value, min, max, color) {
  const cvs = document.getElementById(canvasId);
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const w = cvs.width = cvs.clientWidth || 220;
  const h = cvs.height = cvs.clientHeight || 120;
  ctx.clearRect(0,0,w,h);
  const cx = w/2, cy = h*0.95;
  const r = Math.min(w*0.45, h*0.9);
  const start = Math.PI, end = 2*Math.PI;
  // background
  ctx.lineWidth = r*0.18;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(cx,cy,r,start,end); ctx.stroke();
  // value
  const pct = (Math.max(min, Math.min(max, value)) - min)/(max-min);
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(cx,cy,r,start,start + (end-start)*pct); ctx.stroke();
  // needle
  const ang = start + (end-start)*pct;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx,cy);
  ctx.lineTo(cx + r*0.9*Math.cos(ang), cy + r*0.9*Math.sin(ang));
  ctx.stroke();
}

// Cache last draw to avoid over-draw storms
let _lastRpmDraw = 0;
let _lastSpeedDraw = 0;

// Extend updateCAN to draw gauges
const _origUpdateCAN = window.updateCAN;
window.updateCAN = function(data) {
  _origUpdateCAN && _origUpdateCAN(data);

  // RPM
  const rpmVal = data.rpm ??
    (data.signals && (data.signals.EngineRPM || data.signals.EngineSpeed || data.signals.EngSpeed));
  if (rpmVal !== undefined) {
    window.lastRpmValue = rpmVal;
    const now = performance.now();
    if (now - _lastRpmDraw > 120) {
      drawSemiGauge('rpm-gauge', Number(rpmVal), 0, 8000, '#f59e0b');
      _lastRpmDraw = now;
      console.log('[Gauge] RPM gauge updated:', rpmVal);
    }
  }

  // Speed (optional)
  if (data.speed !== undefined) {
    const now = performance.now();
    if (now - _lastSpeedDraw > 200) {
      drawSemiGauge('speed-gauge', Number(data.speed), 0, 220, '#3b82f6');
      _lastSpeedDraw = now;
    }
  }
};

// Ensure gauge canvases exist (idempotent)
function ensureGaugeCanvas(id, label, afterId) {
  if (document.getElementById(id)) return;
  const dash = document.getElementById('dashboard-tab');
  if (!dash) return;
  const wrap = document.createElement('div');
  wrap.className = 'gauge-container';
  wrap.innerHTML = `
    <h3>${label}</h3>
    <canvas id="${id}"></canvas>
    <div id="${id.replace('-gauge','')}-value" class="metric-value">0</div>
  `;
  dash.querySelector('.dashboard-grid')?.appendChild(wrap);
  console.warn('[UI] Injected missing gauge canvas:', id);
}

// Call once DOM ready
document.addEventListener('DOMContentLoaded', () => {
  ensureGaugeCanvas('rpm-gauge','Engine RPM');
  ensureGaugeCanvas('speed-gauge','Vehicle Speed');
});

// Wrap original updateCAN AFTER its definition
const __origUpdateCANInternal = window.updateCAN;
window.updateCAN = function(data){
  ensureGaugeCanvas('rpm-gauge','Engine RPM');
  ensureGaugeCanvas('speed-gauge','Vehicle Speed');
  __origUpdateCANInternal && __origUpdateCANInternal(data);

  // Force immediate gauge redraw if values present but earlier width was 0
  if (window.lastRpmValue !== undefined) {
     drawSemiGauge('rpm-gauge', Number(window.lastRpmValue), 0, 8000, '#f59e0b');
  }
  if (data.speed !== undefined) {
     drawSemiGauge('speed-gauge', Number(data.speed), 0, 220, '#3b82f6');
  }
};

// Ek debug: ilk 5 mesajda sinyal isimlerini özetle
let _msgCountDebug = 0;
window.addEventListener('message', e => {
  const m = e.data;
  if (m?.command === 'canData') {
    if (_msgCountDebug < 5) {
      console.log('[DEBUG canData] rpm field =', m.data.rpm,
                  'signal keys=', m.data.signals ? Object.keys(m.data.signals) : 'none');
      _msgCountDebug++;
    }
  }
});

// Manuel test helper
window.testRPM = function(v= (500+Math.random()*3000)|0){
  window.updateCAN({ rpm: v, signals:{ EngineRPM:v } });
  console.log('[TEST] Inject RPM', v);
};

// İlk animasyon (gauge boşsa görünür hale getir)
setTimeout(()=> {
  if (document.getElementById('rpm-gauge')) {
    drawSemiGauge('rpm-gauge', 0, 0, 8000, '#f59e0b');
    drawSemiGauge('speed-gauge', 0, 0, 220, '#3b82f6');
    console.log('[INIT] Gauges primed.');
  }
}, 400);

// On resize redraw
window.addEventListener('resize', () => {
  if (window.lastRpmValue !== undefined) {
    drawSemiGauge('rpm-gauge', window.lastRpmValue, 0, 8000, '#f59e0b');
  }
});

// Initial lazy draw
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    drawSemiGauge('rpm-gauge', 0, 0, 8000, '#f59e0b');
    drawSemiGauge('speed-gauge', 0, 0, 220, '#3b82f6');
  }, 300);
});