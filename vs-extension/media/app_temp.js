// ...existing code...
import { Speedometer } from './js/charts/speedometer.js';
import { Rpm } from './js/charts/rpm.js';
import { TemperatureGauges } from './js/charts/tempGauges.js';

const vscode = acquireVsCodeApi();

// Global gauge instances with better initialization
let speedometer = null;
let rpm = null;
let tempGauges = null;
let gaugesInitialized = false;
let tabsInitialized = false;

// Live CAN Feed variables
let canMessages = [];
let messageCounter = 0;
let feedPaused = false;

// Fix gauge initialization
function initializeGauges() {
    console.log('🔧 Initializing gauges...');
    
    try {
        // Initialize speedometer
        const speedCanvas = document.getElementById('speedometer');
        if (speedCanvas) {
            speedometer = new Speedometer(speedCanvas);
            console.log('✅ Speedometer initialized');
        } else {
            console.error('❌ Speedometer canvas not found');
        }
        
        // Initialize RPM
        const rpmCanvas = document.getElementById('rpm');
        if (rpmCanvas) {
            rpm = new Rpm(rpmCanvas);
            console.log('✅ RPM gauge initialized');
        } else {
            console.error('❌ RPM canvas not found');
        }
        
        // Initialize temperature gauges
        const tempCanvas = document.getElementById('temperature-gauges');
        if (tempCanvas) {
            tempGauges = new TemperatureGauges(tempCanvas);
            console.log('✅ Temperature gauges initialized');
        } else {
            console.error('❌ Temperature gauges canvas not found');
        }
        
        gaugesInitialized = true;
        console.log('✅ All gauges initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing gauges:', error);
    }
}

// Enhanced clear all charts function with additional metrics
function clearCharts() {
    console.log('🧹 Clearing all charts and metrics...');
    
    try {
        // Clear gauge values
        if (speedometer) {
            speedometer.setValue(0);
        }
        
        if (rpm) {
            rpm.setValue(0);
        }
        
        if (tempGauges) {
            tempGauges.setEngineTemp(0);
            tempGauges.setCoolantTemp(0);
        }
        
        // Clear additional metrics in the DOM
        const metricsToReset = ['distance', 'operation-time', 'speed', 'fuel-rate', 'fuel-eco'];
        metricsToReset.forEach(metricId => {
            const element = document.getElementById(metricId);
            if (element) {
                element.textContent = '0';
            }
            
            // Also clear any value displays with -value suffix
            const valueElement = document.getElementById(`${metricId}-value`);
            if (valueElement) {
                valueElement.textContent = '0';
            }
        });
        
        // Update any special formatting or units
        updateMetricDisplay('distance', 0, 'km');
        updateMetricDisplay('operation-time', 0, 'h');
        updateMetricDisplay('speed', 0, 'km/h');
        updateMetricDisplay('fuel-rate', 0, 'l/h');
        updateMetricDisplay('fuel-eco', 0, 'km/l');
        
        console.log('✅ All charts and metrics reset to 0');
    } catch (error) {
        console.error('❌ Error clearing charts:', error);
    }
}

// Helper to update metric displays with proper formatting
function updateMetricDisplay(id, value, unit = '') {
    const element = document.getElementById(id);
    const valueElement = document.getElementById(`${id}-value`);
    
    // Format value based on type
    let formattedValue = value;
    
    // Apply specific formatting for different metrics
    switch (id) {
        case 'distance':
            formattedValue = value.toFixed(1); // 1 decimal place for distance
            break;
            
        case 'operation-time':
            formattedValue = value.toFixed(1); // 1 decimal place for hours
            break;
            
        case 'speed':
            formattedValue = Math.round(value); // Whole number for speed
            break;
            
        case 'fuel-rate':
            formattedValue = value.toFixed(2); // 2 decimal places for fuel rate
            break;
            
        case 'fuel-eco':
            formattedValue = value.toFixed(1); // 1 decimal place for economy
            break;
            
        default:
            formattedValue = value.toString();
    }
    
    // Update elements if they exist
    if (element) {
        element.textContent = unit ? `${formattedValue} ${unit}` : formattedValue;
    }
    
    if (valueElement) {
        valueElement.textContent = formattedValue;
    }
    
    return formattedValue;
}

// Extend MQTT status indicator with stats panel
function ensureMqttStatsArea() {
    let stats = document.getElementById('mqtt-stats');
    if (!stats) {
        const container = document.querySelector('.mqtt-status');
        if (!container) return;
        stats = document.createElement('div');
        stats.id = 'mqtt-stats';
        stats.style.fontSize = '11px';
        stats.style.marginTop = '4px';
        stats.style.opacity = '0.75';
        container.appendChild(stats);
    }
    return stats;
}

// Update diagnostics
function updateMqttDiagnostics(d) {
    const el = ensureMqttStatsArea();
    if (!el) return;
    const rate = d.uptimeMs > 0 ? (d.count * 1000 / d.uptimeMs).toFixed(2) : '0';
    el.textContent = `Msgs: ${d.count} | Rate: ${rate}/s | Last: ${d.lastMsgDelta}ms | Topics: ${d.topics.join(', ')}`;
}

// ---- Helpers ----
function toNum(v) {
    if (v === undefined || v === null) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
}

function hasAnyValidValue(d) {
    return ['speed','rpm','engineTemp','coolantTemp','distance','operationTime','fuelRate','fuelEco']
        .some(k => d[k] !== undefined);
}

// ---- Gauge / metric update ----
function updateGaugesAndMetrics(data) {
    if (!gaugesInitialized) initializeGauges();

    // Speed (gauge + metric)
    if (data.speed !== undefined && speedometer) {
        speedometer.setValue(data.speed);
        updateMetricDisplay('speed', data.speed, 'km/h');
    }
    // RPM
    if (data.rpm !== undefined && rpm) {
        rpm.setValue(data.rpm);
    }
    // Temps
    if (tempGauges) {
        if (data.engineTemp !== undefined) tempGauges.setEngineTemp(data.engineTemp);
        if (data.coolantTemp !== undefined) tempGauges.setCoolantTemp(data.coolantTemp);
    }
    // Extra metrics
    if (data.distance !== undefined) updateMetricDisplay('distance', data.distance, 'km');
    if (data.operationTime !== undefined) updateMetricDisplay('operation-time', data.operationTime, 'h');
    if (data.fuelRate !== undefined) updateMetricDisplay('fuel-rate', data.fuelRate, 'l/h');
    if (data.fuelEco !== undefined) updateMetricDisplay('fuel-eco', data.fuelEco, 'km/l');
}

// ---- CAN data processing ----
function processCanData(raw) {
    if (!raw) return;
    // Prefer already standardized fields from extension
    const signals = (raw.signals && typeof raw.signals === 'object') ? raw.signals : {};
    const data = {
        speed: toNum(raw.speed ?? signals.VehicleSpeed ?? signals.vehicle_speed ?? signals.SPEED),
        rpm: toNum(raw.rpm ?? signals.EngineRPM ?? signals.engine_rpm ?? signals.RPM),
        engineTemp: toNum(raw.engineTemp ?? signals.EngineTemp ?? signals.engine_temp),
        coolantTemp: toNum(raw.coolantTemp ?? signals.CoolantTemp ?? signals.coolant_temp),
        distance: toNum(raw.distance ?? signals.Distance ?? signals.TripDistance),
        operationTime: toNum(raw.operationTime ?? signals.OperationTime ?? signals.EngineHours),
        fuelRate: toNum(raw.fuelRate ?? signals.FuelRate ?? signals.fuel_rate),
        fuelEco: toNum(raw.fuelEco ?? signals.FuelEconomy ?? signals.fuel_economy ?? signals.fuel_efficiency),
        originalData: raw.originalData || raw
    };
    // Debug
    console.log('[vsCANView] CAN frame -> speed:', data.speed, 'rpm:', data.rpm);
    if (hasAnyValidValue(data)) {
        updateGaugesAndMetrics(data);
    }
    addCanMessageToFeed(raw, !!raw.isTestData);
}

// Extend message event
window.addEventListener('message', e => {
    const m = e.data;
    if (!m) return;
    switch (m.command) {
        case 'canData':
            processCanData(m.data);
            break;
        case 'mqttStats':
            updateMqttDiagnostics(m);
            break;
        case 'mqttStatus':
            // Optionally handle status (keep if earlier implementation exists)
            break;
        case 'dataStatus':
            // Optional handling for test data flag
            break;
        default:
            // ...existing code...
            break;
    }
});

// Initialize Live CAN Feed
function initLiveCanFeed() {
    const pauseButton = document.getElementById('pause-feed');
    const clearButton = document.getElementById('clear-feed');
}

// Simple HTML escaper (add once)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
}

// Recursively remove any "signals" key
function sanitizeForJsonDisplay(obj, depth = 0) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(o => sanitizeForJsonDisplay(o, depth + 1));
    const out = {};
    for (const k of Object.keys(obj)) {
        if (k === 'signals') continue;                // drop signals everywhere
        if (k === 'originalData') {
            // keep originalData but without its signals inside
            out[k] = sanitizeForJsonDisplay(obj[k], depth + 1);
            continue;
        }
        out[k] = sanitizeForJsonDisplay(obj[k], depth + 1);
    }
    return out;
}

// Replace existing addCanMessageToFeed implementation
function addCanMessageToFeed(canData, isTestData = false) {
    if (feedPaused) return;
    const messagesContainer = document.getElementById('can-messages');
    const messageCounterEl = document.getElementById('message-counter');
    if (!messagesContainer) return;

    const noMsg = messagesContainer.querySelector('.no-messages');
    if (noMsg) noMsg.remove();

    const timestamp = new Date().toLocaleTimeString();
    const repairedFlag = canData.originalData && canData.originalData._repairedSignals;

    const original = canData.originalData || canData;
    const signalsObj = (original.signals && typeof original.signals === 'object') ? original.signals : {};
    const signalKeys = Object.keys(signalsObj);
    const signalsCount = signalKeys.length;

    const signalsListHtml = signalKeys.length
        ? signalKeys.map(k => {
            let v = signalsObj[k];
            if (typeof v === 'number') v = Number.isInteger(v) ? v : v.toFixed(2);
            return `<div class="signal-item"><span class="sig-name">${k}</span><span class="sig-sep">=</span><span class="sig-val">${v}</span></div>`;
          }).join('')
        : '<div class="signal-empty">No signals</div>';

    // Sanitize object (remove all signals recursively)
    const sanitized = sanitizeForJsonDisplay(original);
    const jsonBody = JSON.stringify(sanitized, null, 2);

    const card = document.createElement('div');
    card.className = 'can-message' + (isTestData ? ' test-data' : '') + (repairedFlag ? ' repaired-signals' : '');
    card.innerHTML = `
      <div class="message-header">
        <span class="timestamp">${timestamp}</span>
        <span class="message-id">ID: ${canData.id || 'N/A'}</span>
        ${signalsCount ? `<span class="signals-badge">${signalsCount} sig</span>` : '<span class="signals-badge empty">0 sig</span>'}
        ${isTestData ? '<span class="test-data-badge">TEST</span>' : ''}
        ${repairedFlag ? '<span class="repaired-badge">REPAIRED</span>' : ''}
      </div>
      <div class="signals-block">
        <div class="signals-header">Signals (${signalsCount})</div>
        <div class="signals-list">
          ${signalsListHtml}
        </div>
      </div>
      <div class="message-data">
        <pre class="json-body">${escapeHtml(jsonBody)}</pre>
      </div>
    `;

    messagesContainer.insertBefore(card, messagesContainer.firstChild);

    const cards = messagesContainer.querySelectorAll('.can-message');
    if (cards.length > 150) cards[cards.length - 1].remove();

    messageCounter++;
    if (messageCounterEl) messageCounterEl.textContent = `Messages: ${messageCounter}`;
}