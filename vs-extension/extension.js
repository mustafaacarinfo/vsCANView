const vscode = require('vscode');
const mqtt = require('mqtt');
const fs = require('fs');

let client = null;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('canDebugger.openDashboard', () => Dashboard.createOrShow(context))
  );
  ensureMqtt(context);
}

function deactivate() { 
  if (client) { 
    try { 
      client.end(true); 
    } catch {} 
  } 
}

function ensureMqtt(context) {
  if (client) return client;
  const cfg = vscode.workspace.getConfiguration('canDebugger');
  const url = cfg.get('brokerUrl') || 'mqtt://localhost:1883';
  const c = mqtt.connect(url, {
    clientId: (cfg.get('clientId') || 'vscode-can-modular') + '-' + Math.random().toString(16).slice(2),
    username: cfg.get('username') || undefined,
    password: cfg.get('password') || undefined,
    reconnectPeriod: 2000
  });

  c.on('connect', () => {
    console.log('✅ MQTT connected successfully to:', url);
    // Send connection status update immediately when connected
    postAll({ type: 'conn', ok: true });
    try {
      const topic = cfg.get('topic') || 'can/#';
      c.subscribe(topic);
      console.log('📡 Subscribed to MQTT topic:', topic);
    } catch (e) {
      console.error('❌ MQTT subscription error:', e);
    }
  });

  c.on('close', () => {
    console.log('🔌 MQTT connection closed');
    postAll({ type: 'conn', ok: false });
  });

  c.on('offline', () => {
    console.log('📡 MQTT offline');
    postAll({ type: 'conn', ok: false });
  });

  c.on('message', (topic, p) => {
    let obj = null;
    const rawMessage = p.toString('utf8');
    
    try {
      obj = JSON.parse(rawMessage);
    } catch (e) {
      console.error('❌ MQTT message parsing error:', e);
      return;
    }
    
    if (obj) {
      postAll({ type: 'can', topic, payload: obj });
    }
  });

  c.on('error', err => {
    console.error('❌ MQTT error:', err);
    postAll({ type: 'conn', ok: false });
    vscode.window.showErrorMessage('MQTT error: ' + err.message);
  });

  client = c;
  return client;
}

function postAll(msg){ 
  if (Dashboard.instance) Dashboard.instance.post(msg); 
}

class Dashboard {
  static instance = null;
  
  constructor(panel, context) { 
    this.panel = panel; 
    this.context = context; 
    this.setHtml(); 
    panel.onDidDispose(() => Dashboard.instance = null);
    
    // Webview'dan gelen mesajları dinle
    panel.webview.onDidReceiveMessage((message) => {
      console.log('Extension\'da mesaj alındı:', message);
      if (message.type === 'getVehicleUri') {
        const wv = this.panel.webview;
        const mediaUri = (...p) => wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...p)).toString();
        const vehUri = mediaUri('vehicle.glb');
        console.log('Vehicle URI gönderiliyor:', vehUri);
        this.panel.webview.postMessage({ type: 'vehicleUri', uri: vehUri });
      }
    });
  }
  
  static createOrShow(context) {
    const col = vscode.window.activeTextEditor?.viewColumn;
    if (Dashboard.instance) { 
      Dashboard.instance.panel.reveal(col); 
      return; 
    }
    const panel = vscode.window.createWebviewPanel(
      'can3dmod',
      'CAN Debugger (Modular)',
      col ?? vscode.ViewColumn.One,
      {
        enableScripts: true, 
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );
    Dashboard.instance = new Dashboard(panel, context);
  }
  
  setHtml() {
    const wv = this.panel.webview;
    const mediaUri = (...p) => wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...p)).toString();
    const uiPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.html');
    let html = fs.readFileSync(uiPath.fsPath, 'utf8');
    
  // CSP genişletildi: OSM tile sunucusu ve (isteğe bağlı) HTTPS fetch izinleri eklendi
  // Harita fetch() çağrıları connect-src kapsamına girer, img-src de güvenli olsun diye domain eklenir.
  const tileHost = 'https://tile.openstreetmap.org';
  // Tile yüklemede artık fetch değil <img> kullanıldığı için tile host sadece img-src'de yeterli
  const csp = `default-src 'none'; img-src ${wv.cspSource} data: blob: ${tileHost}; style-src ${wv.cspSource} 'unsafe-inline'; script-src ${wv.cspSource} 'unsafe-eval'; connect-src ${wv.cspSource} blob:; worker-src blob:;`;
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
    
    const cssUri = mediaUri('css', 'dashboard.css');
    const vehUri = mediaUri('vehicle.glb');
    
    console.log('Vehicle URI:', vehUri);
    
    // App.js dosyasını oku ve URI'yi replace et, sonra temp dosyaya yaz
    const appPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'js', 'app.js');
    const tempAppPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'js', 'app_temp.js');
    let appJs = fs.readFileSync(appPath.fsPath, 'utf8');
    appJs = appJs.replace('__VEHICLE_URI__', vehUri);
    fs.writeFileSync(tempAppPath.fsPath, appJs);
    
    const appTempUri = mediaUri('js', 'app_temp.js');
    
    html = html.replace('__CSS_URI__', cssUri).replace('__APP_JS__', appTempUri);
    this.panel.webview.html = html;
  }
  
  post(msg) { 
    try { 
      this.panel.webview.postMessage(msg); 
    } catch {} 
  }
}

module.exports = { activate, deactivate };
