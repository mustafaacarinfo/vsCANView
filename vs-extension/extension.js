const vscode = require('vscode');
const mqtt = require('mqtt');
const fs   = require('fs');

let client = null;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('canDebugger.open', () => Dashboard.createOrShow(context))
  );
  ensureMqtt(context);
}

function deactivate() { if (client) { try { client.end(true); } catch {} } }

function ensureMqtt(context) {
  if (client) return client;
  const cfg  = vscode.workspace.getConfiguration('canDebugger');
  const url  = cfg.get('brokerUrl') || 'mqtt://localhost:1883';
  const c = mqtt.connect(url, {
    clientId: (cfg.get('clientId') || 'vscode-can-modular') + '-' + Math.random().toString(16).slice(2),
    username: cfg.get('username') || undefined,
    password: cfg.get('password') || undefined,
    reconnectPeriod: 2000
  });

  c.on('connect', () => {
    postAll({ type:'conn', ok:true });
    try { c.subscribe(cfg.get('topic') || 'can/#'); } catch (e) {}
  });
  c.on('close', () => postAll({ type:'conn', ok:false }));
  c.on('message', (topic, p) => {
    let obj = null; try { obj = JSON.parse(p.toString('utf8')); } catch {}
    if (obj) postAll({ type: 'can', topic, payload: obj });
  });
  c.on('error', err => vscode.window.showErrorMessage('MQTT error: ' + err.message));
  client = c; return client;
}

function postAll(msg){ if (Dashboard.instance) Dashboard.instance.post(msg); }

class Dashboard {
  static instance = null;
  constructor(panel, context) { this.panel = panel; this.context = context; this.setHtml(); panel.onDidDispose(() => Dashboard.instance = null); }
  static createOrShow(context) {
    const col = vscode.window.activeTextEditor?.viewColumn;
    if (Dashboard.instance) { Dashboard.instance.panel.reveal(col); return; }
    const panel = vscode.window.createWebviewPanel('can3dmod','CAN Debugger (Modular)',col ?? vscode.ViewColumn.One,{
      enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    });
    Dashboard.instance = new Dashboard(panel, context);
  }
  setHtml() {
    const wv = this.panel.webview;
    const mediaUri = (...p) => wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...p)).toString();
    const uiPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.html');
    let html = fs.readFileSync(uiPath.fsPath, 'utf8');
    const csp = `default-src 'none'; img-src ${wv.cspSource} data:; style-src ${wv.cspSource} 'unsafe-inline'; script-src ${wv.cspSource};`;
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
    const cssUri = mediaUri('css', 'dashboard.css');
    const appUri = mediaUri('js', 'app.js');
    const vehUri = mediaUri('vehicle.glb'); // media root
    html = html.replace('__CSS_URI__', cssUri).replace('__APP_JS__', appUri).replace('__VEHICLE_URI__', vehUri);
    this.panel.webview.html = html;
  }
  post(msg) { try { this.panel.webview.postMessage(msg); } catch {} }
}

module.exports = { activate, deactivate };
