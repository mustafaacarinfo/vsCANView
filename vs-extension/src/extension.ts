import * as vscode from 'vscode';
import * as mqtt from 'mqtt';
import { repairCanJson } from './utils/canUtils'; // add import (adjust relative path if needed)
import { decodeCanFrameStr } from './utils/canDecode'; // İçe aktarmalar kısmına ekle

// --- Added state / diagnostics ---
let mqttClient: mqtt.MqttClient | null = null;
let mqttMsgCount = 0;
let mqttStartTs = 0;
let mqttLastMsgTs = 0;
let mqttTopicSample: Set<string> = new Set();
let mqttDiagInterval: NodeJS.Timeout | null = null;

// --- QUEUED WEBVIEW POST SUPPORT (ADD NEAR TOP) ---
let panel: vscode.WebviewPanel | undefined; // ensure global reference (if already declared, keep one)
const _pendingWebviewMsgs: any[] = [];
function postToWebview(message: any) {
    if (panel && panel.webview) {
        try {
            panel.webview.postMessage(message);
        } catch (e) {
            console.error('[vsCANView] postMessage failed, queueing:', (e as Error).message);
            _pendingWebviewMsgs.push(message);
        }
    } else {
        _pendingWebviewMsgs.push(message);
    }
}
function flushPendingWebview() {
    if (!panel || !panel.webview) return;
    while (_pendingWebviewMsgs.length) {
        const m = _pendingWebviewMsgs.shift();
        panel.webview.postMessage(m);
    }
}

// --- ADD CAN FLOW MONITOR STATE ---
let canFlowInterval: NodeJS.Timeout | null = null;
function startCanFlowMonitor() {
    if (canFlowInterval) clearInterval(canFlowInterval);

// Start / Stop helpers
function startMqtt(context: vscode.ExtensionContext) {
    mqttClient = initMqttConnection(context);
}

function stopMqtt() {
    if (mqttDiagInterval) {
        clearInterval(mqttDiagInterval);
        mqttDiagInterval = null;
    }
    if (mqttClient) {
        try { mqttClient.end(true); } catch {}
        mqttClient = null;
    }
}

// --- Modified initMqttConnection (wrap existing) ---
function resolveHost(rawHost: string): string {
    const envHost = process.env.VSCAN_MQTT_HOST;
    if (envHost && envHost.trim()) return envHost.trim();
    return rawHost;
}

// Initialize MQTT connection with reconnect logic and test data generation
function initMqttConnection(context: vscode.ExtensionContext) {
    const cfg = vscode.workspace.getConfiguration('vscanView');
    const host = resolveHost(cfg.get<string>('mqtt.host', 'localhost'));
    const port = cfg.get<number>('mqtt.port', 1883);
    const wsPort = cfg.get<number>('mqtt.wsPort', 9001);
    const baseTopic = cfg.get<string>('mqtt.baseTopic', 'can/#') || 'can/#';
    const forceWs = cfg.get<boolean>('mqtt.useWebSocket', false);
    const autoTest = cfg.get<boolean>('mqtt.enableAutoTestData', true);

    const tcpUrl = `mqtt://${host}:${port}`;
    const wsUrl = `ws://${host}:${wsPort}/mqtt`;

    const options: mqtt.IClientOptions = {
        clientId: `vscan-viewer-${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        reconnectPeriod: 4000,
        connectTimeout: 4000
    };

    let usingWs = forceWs;
    let urlToUse = usingWs ? wsUrl : tcpUrl;

    console.log(`[vsCANView] 📡 Connecting MQTT (${usingWs ? 'WS' : 'TCP'}) -> ${urlToUse} topic=${baseTopic}`);

    const client = mqtt.connect(urlToUse, options);

    mqttStartTs = Date.now();
    mqttMsgCount = 0;
    mqttLastMsgTs = 0;
    mqttTopicSample.clear();

    // Periodic diagnostics -> webview
    if (mqttDiagInterval) clearInterval(mqttDiagInterval);
    mqttDiagInterval = setInterval(() => {
        if (panel && panel.webview) {
            panel.webview.postMessage({
                command: 'mqttStats',
                count: mqttMsgCount,
                uptimeMs: Date.now() - mqttStartTs,
                lastMsgDelta: mqttLastMsgTs ? (Date.now() - mqttLastMsgTs) : -1,
                topics: Array.from(mqttTopicSample).slice(0, 8)
            });
        }
    }, 5000);

    // Fallback to WS on first error (TCP only)
    let firstConnAttempt = true;

    client.on('connect', () => {
        console.log(`[vsCANView] ✅ MQTT connected (${usingWs ? 'WS' : 'TCP'})`);
        client.subscribe(baseTopic, { qos: 0 }, (err) => {
            if (err) {
                console.error('[vsCANView] ❌ Subscribe failed:', err.message);
            } else {
                console.log('[vsCANView] 📡 Subscribed:', baseTopic);
            }
        });
        if (panel && panel.webview) {
            panel.webview.postMessage({ command: 'mqttStatus', connected: true, transport: usingWs ? 'ws' : 'tcp' });
        }
    });

    client.on('reconnect', () => {
        console.log('[vsCANView] 🔄 Reconnecting...');
        if (panel && panel.webview) {
            panel.webview.postMessage({ command: 'mqttStatus', connected: false, reconnecting: true });
        }
    });

    client.on('error', (err) => {
        console.error('[vsCANView] ❌ MQTT error:', err.message);
        if (firstConnAttempt && !usingWs && !forceWs) {
            firstConnAttempt = false;
            console.warn('[vsCANView] ⚠️ Switching to WebSocket fallback...');
            try { client.end(true); } catch {}
            usingWs = true;
            return startMqtt(context);
        }
        if (panel && panel.webview) {
            panel.webview.postMessage({ command: 'mqttStatus', connected: false, error: err.message });
        }
    });

    client.on('offline', () => {
        console.warn('[vsCANView] ⚠️ Offline');
        if (panel && panel.webview) {
            panel.webview.postMessage({ command: 'mqttStatus', connected: false });
        }
    });

    // Auto-test injection control
    let testDataTimer: NodeJS.Timeout | null = null;
    let realDataSeen = false;
    const TEST_DELAY_MS = 6000;

    function startTestDataLoop() {
        if (!autoTest) return;
        if (testDataTimer) return;
        console.warn('[vsCANView] 🧪 Injecting test data (no real CAN frames).');
        testDataTimer = setInterval(() => {
            if (!panel || !panel.webview) return;
            panel.webview.postMessage({
                command: 'canData',
                data: {
                    id: '0xTEST',
                    timestamp: Date.now(),
                    speed: 40 + Math.random() * 20,
                    rpm: 1500 + Math.random() * 1200,
                    engineTemp: 75 + Math.random() * 10,
                    coolantTemp: 70 + Math.random() * 8,
                    distance: Math.random() * 100,
                    operationTime: Math.random() * 5,
                    fuelRate: 5 + Math.random() * 2,
                    fuelEco: 12 + Math.random() * 3,
                    isTestData: true
                }
            });
        }, 1000);
    }

    setTimeout(() => {
        if (!realDataSeen) startTestDataLoop();
    }, TEST_DELAY_MS);

    // Define possible field names for each metric
    const fieldMappings = {
        speed: ['VehicleSpeed', 'vehicle_speed', 'SPEED', 'speed', 'Speed'],
        rpm: ['EngineRPM', 'EngineSpeed', 'EngSpeed', 'engine_rpm', 'RPM', 'rpm'], // <- EngSpeed & EngineSpeed eklendi
        engineTemp: ['EngineTemp', 'engine_temp', 'ENGINE_TEMP', 'engineTemp'],
        coolantTemp: ['CoolantTemp', 'coolant_temp', 'COOLANT_TEMP', 'coolantTemp'],
        distance: ['Distance', 'distance', 'DISTANCE', 'trip_distance', 'odometer', 'TripDistance'],
        operationTime: ['OperationTime', 'operation_time', 'OPERATION', 'engine_hours', 'hours'],
        fuelRate: ['FuelRate', 'fuel_rate', 'FUEL_RATE', 'consumption', 'fuel_consumption'],
        fuelEco: ['FuelEconomy', 'fuel_economy', 'FUEL_ECO', 'fuel_efficiency', 'economy', 'mpg', 'km_per_liter']
    };

    // Helper function to extract value by trying multiple field names
    function extractValue(obj: any, fieldNames: string[]): number | undefined {
        if (!obj) return undefined;
        
        for (const name of fieldNames) {
            if (name in obj && obj[name] !== undefined) {
                const val = Number(obj[name]);
                if (!isNaN(val)) return val;
            }
        }
        return undefined;
    }

    client.on('message', (topic, payload) => {
        mqttMsgCount++;
        mqttLastMsgTs = Date.now();
        if (mqttTopicSample.size < 12) mqttTopicSample.add(topic);

        if (!realDataSeen && mqttMsgCount > 3) {
            realDataSeen = true;
            if (testDataTimer) {
                clearInterval(testDataTimer);
                testDataTimer = null;
                console.log('[vsCANView] ✅ Real data detected, stopping test feed.');
                if (panel && panel.webview) {
                    panel.webview.postMessage({ command: 'dataStatus', usingTestData: false });
                }
            }
        }

        const msgStr = payload.toString().replace(/\0+$/g, '').trim();
        if (!msgStr) return;

        // Raw CAN frame kontrol et (ID#DATA formatı - cansend formatı)
        if (msgStr.includes('#')) {
            try {
                const topicParts = topic.split('/');
                const idFromTopic = topicParts[topicParts.length - 1];

                console.log(`[vsCANView] 📥 Incoming raw J1939 frame: ${msgStr}`);
                const signals = decodeCanFrameStr(msgStr);

                // RPM alias yoksa burada da üret (savunmacı)
                if (signals.EngineSpeed && !signals.EngineRPM) {
                    signals.EngineRPM = signals.EngineSpeed;
                }
                if (signals.EngSpeed && !signals.EngineRPM && !signals.EngineSpeed) {
                    signals.EngineRPM = signals.EngSpeed;
                }

                if (Object.keys(signals).length > 0) {
                    console.log(`[vsCANView] 🔍 Decoded signals:`, signals);
                    
                    const rpmResolved = signals.EngineRPM ?? signals.EngineSpeed ?? signals.EngSpeed;
                    if (rpmResolved === undefined) {
                        console.warn('[vsCANView] ⚠️ RPM not resolved from frame:', msgStr);
                    }
                    // Webview'a gönderilecek standart veri objesi
                    const standardizedData = {
                        id: idFromTopic,
                        timestamp: Date.now(),
                        raw: msgStr,
                        signals: signals,
                        rpm: rpmResolved ?? 0,
                        originalData: { signals } // Dashboard.js'in belediği format
                    };
                    
                    // Debug: kısa özet
                    console.log('[vsCANView] → Webview push RPM=', standardizedData.rpm);

                    if (panel && panel.webview) {
                        panel.webview.postMessage({ command: 'canData', data: standardizedData });
                        console.log(`[vsCANView] 📨 Sent decoded J1939 data to webview`);
                    }
                }
                return; // Ham frame işlendi, JSON parse etmeye gerek yok.
            } catch (e) {
                console.error(`[vsCANView] ❌ Raw CAN frame decode error:`, e);
            }
        }

        // JSON formatını dene
        if (msgStr.startsWith('{')) {
            let raw = msgStr;
            if (raw.includes('"signals"')) {
                const originalRaw = raw;
                raw = repairCanJson(raw);
                if (raw !== originalRaw) {
                    console.log('[vsCANView] 🔧 Repaired CAN JSON (signals).');
                }
            }

            let obj: any;
            try {
                obj = JSON.parse(raw);
            } catch (e) {
                console.error('[vsCANView] Parse failed after repair:', (e as Error).message);
                return;
            }

            const signals = obj.signals || {};
            // --- FIX: rpm alias (EngSpeed) fallback ---
            if (signals.EngSpeed && signals.EngineRPM === undefined && signals.EngineSpeed === undefined) {
                signals.EngineRPM = signals.EngSpeed;
            }

            const standardizedData = {
                id: obj.id ?? topic.split('/').pop() ?? 'unknown',
                timestamp: obj.timestamp || obj.ts || Date.now(),
                bus: obj.bus || 'unknown',
                raw: obj.raw || '',
                name: obj.name || '',
                // --- FIX: signals objesini webview’a geçir ---
                signals, // <--- EKLENDİ
                speed: extractValue(signals, fieldMappings.speed) ?? extractValue(obj, fieldMappings.speed) ?? 0,
                rpm: extractValue(signals, fieldMappings.rpm) ?? extractValue(obj, fieldMappings.rpm) ?? 0,
                engineTemp: extractValue(signals, fieldMappings.engineTemp) ?? extractValue(obj, fieldMappings.engineTemp) ?? 0,
                coolantTemp: extractValue(signals, fieldMappings.coolantTemp) ?? extractValue(obj, fieldMappings.coolantTemp) ?? 0,
                distance: extractValue(signals, fieldMappings.distance) ?? extractValue(obj, fieldMappings.distance) ?? 0,
                operationTime: extractValue(signals, fieldMappings.operationTime) ?? extractValue(obj, fieldMappings.operationTime) ?? 0,
                fuelRate: extractValue(signals, fieldMappings.fuelRate) ?? extractValue(obj, fieldMappings.fuelRate) ?? 0,
                fuelEco: extractValue(signals, fieldMappings.fuelEco) ?? extractValue(obj, fieldMappings.fuelEco) ?? 0,
                originalData: obj
            };
            console.log('[vsCANView] JSON→std rpm=', standardizedData.rpm, 'signalKeys=', Object.keys(signals));

            // After parsing the message and standardizing
            console.log('[vsCANView] 📤 Standardized data:', JSON.stringify({
                speed: standardizedData.speed,
                distance: standardizedData.distance,
                operationTime: standardizedData.operationTime,
                fuelRate: standardizedData.fuelRate,
                fuelEco: standardizedData.fuelEco
            }));

            if (panel && panel.webview) {
                try {
                    panel.webview.postMessage({ 
                        command: 'canData', 
                        data: standardizedData 
                    });
                    console.log('[vsCANView] 📤 Message sent to webview');
                } catch (e) {
                    console.error('[vsCANView] 🚨 Failed to send message to webview:', e);
                }
            } else {
                console.log('[vsCANView] ⚠️ No webview panel available');
            }
        }
    });

    context.subscriptions.push({
        dispose: () => {
            if (testDataTimer) clearInterval(testDataTimer);
            if (mqttDiagInterval) clearInterval(mqttDiagInterval);
        }
    });

    return client;
}
