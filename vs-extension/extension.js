// extension.js — CAN Debugger (Full + 3D v2) — INLINE WEBVIEW BUILD
// Çalışma dizini: ~/projects/vsCANView/vs-extension

const vscode = require('vscode');
const mqtt = require('mqtt');
const fs   = require('fs');
const path = require('path');

let client = null;

function activate(context) {
  // Komutı kaydet
  context.subscriptions.push(
    vscode.commands.registerCommand('canDebugger.open', () => Dashboard.createOrShow(context))
  );

  // MQTT bağlantısını hazırla (configten alır)
  ensureMqtt(context);
}

function deactivate() {
  if (client) {
    try { client.end(true); } catch {}
  }
}

// ---- MQTT ----
function ensureMqtt(context) {
  if (client) return client;

  const cfg  = vscode.workspace.getConfiguration('canDebugger');
  const url  = cfg.get('brokerUrl') || 'mqtt://localhost:1883';
  const user = cfg.get('username') || undefined;
  const pass = cfg.get('password') || undefined;

  const c = mqtt.connect(url, {
    clientId: (cfg.get('clientId') || 'vscode-can-3d-full') + '-' + Math.random().toString(16).slice(2),
    username: user,
    password: pass,
    reconnectPeriod: 2000
  });

  c.on('connect', () => {
    try { c.subscribe(cfg.get('topic') || 'can/#'); } catch (e) {}
  });

  c.on('message', (_t, p) => {
    let obj = null;
    try { obj = JSON.parse(p.toString('utf8')); } catch {}
    if (obj && Dashboard.instance) {
      Dashboard.instance.post({ type: 'can', topic: _t, payload: obj });
    }
  });

  c.on('error', err => vscode.window.showErrorMessage('MQTT error: ' + err.message));
  client = c;
  return client;
}

// ---- Webview Panel ----
class Dashboard {
  static instance = null;

  constructor(panel, context) {
    this.panel = panel;
    this.context = context;
    this.setHtml();               // HTML’i yükle
    panel.onDidDispose(() => Dashboard.instance = null);
  }

  static createOrShow(context) {
    const col = vscode.window.activeTextEditor?.viewColumn;
    if (Dashboard.instance) {
      Dashboard.instance.panel.reveal(col);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'can3dfull',
      'CAN Debugger (Full + 3D v2)',
      col ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // localResourceRoots sadece medya klasörü için gerekliydi; inline HTML’de şart değil ama dursun.
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );
    Dashboard.instance = new Dashboard(panel, context);
  }

  setHtml() {
    const wv = this.panel.webview;
    const cfg = vscode.workspace.getConfiguration('canDebugger');

    // Kullanıcının ayarladığı GLB yolu → webview URL’sine çevir
    let modelUri = '';
    const pth = cfg.get('modelPath') || '';
    if (pth) {
      try { modelUri = wv.asWebviewUri(vscode.Uri.file(pth)).toString(); } catch {}
    }

    // full.html’i diskten oku
    const uiPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'full.html');
    let html = fs.readFileSync(uiPath.fsPath, 'utf8');

    // CSP — inline script ve style’a izin ver (aksi halde siyah ekran olur)
    const csp = `default-src 'none'; img-src ${wv.cspSource} data:; style-src ${wv.cspSource} 'unsafe-inline'; script-src ${wv.cspSource} 'unsafe-inline'; frame-src ${wv.cspSource}; media-src ${wv.cspSource}`;
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);

    // Extension’dan model yolunu enjekte et (sayfa yüklenince otomatik denesin)
    html += `
<script>
  window.addEventListener('load', () => {
    const url = ${JSON.stringify(modelUri)};
    // full.html içindeki 3D IIFE, __setModelFromBuffer fonksiyonunu expose ediyor.
    if (url && window.__setModelFromBuffer) {
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(buf => window.__setModelFromBuffer(buf))
        .catch(err => console.warn('GLB fetch failed', err));
    }
  });
</script>`;

    this.panel.webview.html = html;

    // Webview’e mesaj iletmek için küçük köprü
    this.panel.webview.onDidReceiveMessage((msg) => {
      // Şimdilik tek yönlü (MQTT → webview) kullanıyoruz. İleride ihtiyaç olursa burayı genişletiriz.
      // console.log('from webview:', msg);
    });
  }

  post(msg) {
    try { this.panel.webview.postMessage(msg); } catch {}
  }
}

module.exports = { activate, deactivate };
