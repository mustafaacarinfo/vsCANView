const vscode = require('vscode');
const mqtt = require('mqtt');
const fs = require('fs');

let client = null;

let sessionFirstPanel = true; // VS Code her yeniden açıldığında true başlar (modül yeniden yüklenir)
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('canDebuggerModular.openDashboard', () => Dashboard.createOrShow(context))
  );
  ensureMqtt(context);
  if (vscode.window.registerWebviewPanelSerializer) {
    Dashboard.createOrShow(context); // İlk panel otomatik
  }

  // Basit bir TreeDataProvider kaydet: activity bar içindeki view için veri sağlayacak
  class OpenDashboardProvider {
    getTreeItem(element) {
      return element;
    }
    getChildren() {
      const item = new vscode.TreeItem('Open Dashboard');
      item.command = { command: 'canDebuggerModular.openDashboard', title: 'Open Dashboard' };
      item.contextValue = 'openDashboard';
      return [item];
    }
  }

  const provider = new OpenDashboardProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider('canDashboard', provider));
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
        // Vehicle.glb dosyasını doğrudan göndermek yerine Webview URI'ye dönüştür
        const vehUri = mediaUri('vehicle.glb');
        console.log('Vehicle URI gönderiliyor:', vehUri);
        this.panel.webview.postMessage({ type: 'vehicleUri', uri: vehUri });
        
        // Ayrıca Three.js ve GLTFLoader için alternatif URI'ler de gönder
        const threeUri = mediaUri('js', 'three', 'vendor', 'three.module.js');
        const loaderUri = mediaUri('js', 'three', 'vendor', 'GLTFLoader.js');
        this.panel.webview.postMessage({ 
          type: 'threeUris', 
          threeUri: threeUri,
          loaderUri: loaderUri
        });
      }
    });
    
  // Panel görünürlük değişiminde artık Overview zorlaması yok; kullanıcı sekmesi korunur

    // Webview'dan gelen mesajları dinle
    panel.webview.onDidReceiveMessage((message) => {
      console.log('Extension\'da mesaj alındı:', message);
      if (message.type === 'getVehicleUri') {
        const wv = this.panel.webview;
        const mediaUri = (...p) => wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...p)).toString();
        const vehUri = mediaUri('vehicle.glb');
        console.log('Vehicle URI gönderiliyor:', vehUri);
        this.panel.webview.postMessage({ type: 'vehicleUri', uri: vehUri });
        return;
      }

      // Webview hazır olduğunda sadece vehicle URI gönder; sekme kontrolü dışarıda yapılır
      if (message.type === 'ready') {
        try {
          const wv = this.panel.webview;
          const mediaUri = (...p) => wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...p)).toString();
          const vehUri = mediaUri('vehicle.glb');
          this.panel.webview.postMessage({ type: 'vehicleUri', uri: vehUri });
        } catch (err) { /* ignore */ }
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
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        // Webview'ın CSP kurallarını ayarla
        enableFindWidget: true
      }
    );
    Dashboard.instance = new Dashboard(panel, context);
    if (sessionFirstPanel) {
      sessionFirstPanel = false;
      try { panel.webview.postMessage({ type: 'showOverviewSessionStart' }); } catch {}
    } else {
      try { panel.webview.postMessage({ type: 'restoreLastTab' }); } catch {}
    }
  }
  
  setHtml() {
    const wv = this.panel.webview;
    const mediaUri = (...p) => wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...p)).toString();
    const uiPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.html');
    let html = fs.readFileSync(uiPath.fsPath, 'utf8');
    
    // CSP kurallarını güncelle - VS Code WebView uyumluluğu geliştirmeleri
    const tileHost = 'https://tile.openstreetmap.org';
    const cdnJsHost = 'https://cdn.jsdelivr.net';
    // VS Code WebView için güncellenmiş CSP ayarları:
    // - Chart.js ve diğer CDN'ler için eklenen kurallar
    // - ESM modül yüklemelerini desteklemek için daha geniş izinler
    // - wasm-unsafe-eval eklendi - WASM desteği için
    const csp = `
      default-src 'self' ${wv.cspSource};
      img-src ${wv.cspSource} https: data: blob:;
      style-src ${wv.cspSource} 'unsafe-inline' https:;
      font-src ${wv.cspSource} data: https:;
      script-src ${wv.cspSource} 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https:;
      connect-src ${wv.cspSource} blob: https: data:;
      worker-src ${wv.cspSource} blob: https:;
      frame-src ${wv.cspSource} https:;
    `.replace(/\s+/g, ' ').trim();
    
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
    
    // CSS dosyalarını ekle
  const cssUri = mediaUri('css', 'dashboard.css');
  const fontsCssUri = mediaUri('css', 'fonts.css');
    const signalsCssUri = mediaUri('css', 'signals.css');
    const vsCompatCssUri = mediaUri('css', 'vscode-compat.css');
    
    // GLB model URI'si
    const vehUri = mediaUri('vehicle.glb');
    console.log('Vehicle URI:', vehUri);
    
    // App.js dosyasını oku ve URI'yi replace et, sonra temp dosyaya yaz
    const appPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'js', 'app.js');
    const tempAppPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'js', 'app_temp.js');
    let appJs = fs.readFileSync(appPath.fsPath, 'utf8');
    // VS Code Webview için güvenli URI'yi oluştur
    const secureVehUri = wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vehicle.glb')).toString();
    // HTML URI değiştirilmez; yerine, postMessage yöntemini kullanarak URI'yi gönderir
    appJs = appJs.replace('__VEHICLE_URI__', secureVehUri);
    fs.writeFileSync(tempAppPath.fsPath, appJs);
    
    const appTempUri = mediaUri('js', 'app_temp.js');
    
  // Module sürümlerini doğrudan kullan
  const threeJsUri = mediaUri('js', 'three', 'vendor', 'three.module.js');
  const gltfLoaderUri = mediaUri('js', 'three', 'vendor', 'GLTFLoader.js');
    
    // URI yer tutucuları değiştir
    html = html
      .replace('__CSS_URI__', cssUri)
      .replace('__SIGNALS_CSS_URI__', signalsCssUri)
      .replace('__VS_COMPAT_CSS__', vsCompatCssUri)
      .replace('__FONTS_CSS__', fontsCssUri)
      .replace('__APP_JS__', appTempUri)
  .replace('__THREE_JS_URI__', threeJsUri)
  .replace('__GLTF_LOADER_URI__', gltfLoaderUri);
    
    this.panel.webview.html = html;
  }
  
  post(msg) { 
    try { 
      this.panel.webview.postMessage(msg); 
    } catch {} 
  }
}

module.exports = { activate, deactivate };
