import * as vscode from 'vscode';
import * as mqtt from 'mqtt';
import { repairCanJson } from './utils/canUtils'; // add import (adjust relative path if needed)

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

        let raw = payload.toString('utf8').replace(/\0+$/g, '').trim();
        if (!raw) return;

        // New robust repair path (handles truncated "signals":)
        if (raw.includes('"signals"')) {
            const originalRaw = raw;
            raw = repairCanJson(raw);
            if (raw !== originalRaw) {
                console.log('[vsCANView] 🔧 Repaired CAN JSON (signals).');
            }
        }

        if (raw[0] !== '{') {
            console.warn('[vsCANView] Skipping non-JSON payload topic=', topic, 'sample=', raw.slice(0, 40));
            return;
        }

        let obj: any;
        try {
            obj = JSON.parse(raw);
        } catch (e) {
            console.error('[vsCANView] Parse failed after repair:', (e as Error).message);
            return;
        }

        const signals = (obj.signals && typeof obj.signals === 'object') ? obj.signals : {};

        const norm = (kList: string[], fallbackObj: any[]): number | undefined => {
            for (const k of kList) {
                for (const source of fallbackObj) {
                    if (source && source[k] !== undefined) {
                        const n = Number(source[k]);
                        if (!isNaN(n)) return n;
                    }
                }
            }
            return undefined;
        };

        const standardizedData = {
            id: obj.id ?? topic.split('/').pop() ?? 'unknown',
            timestamp: obj.timestamp || obj.ts || Date.now(),
            bus: obj.bus || 'unknown',
            raw: obj.raw || '',
            name: obj.name || '',
            speed: norm(['VehicleSpeed', 'vehicle_speed', 'speed', 'SPEED'], [signals, obj]) || 0,
            rpm: norm(['EngineRPM', 'engine_rpm', 'rpm', 'RPM'], [signals, obj]) || 0,
            engineTemp: norm(['EngineTemp', 'engine_temp'], [signals, obj]) || 0,
            coolantTemp: norm(['CoolantTemp', 'coolant_temp'], [signals, obj]) || 0,
            distance: norm(['Distance', 'distance', 'TripDistance'], [signals, obj]) || 0,
            operationTime: norm(['OperationTime', 'operation_time', 'EngineHours'], [signals, obj]) || 0,
            fuelRate: norm(['FuelRate', 'fuel_rate'], [signals, obj]) || 0,
            fuelEco: norm(['FuelEconomy', 'fuel_economy', 'fuel_efficiency'], [signals, obj]) || 0,
            originalData: obj
        };

        if (panel && panel.webview) {
            panel.webview.postMessage({ command: 'canData', data: standardizedData });
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
