// Minimal vscode stub for syntax check
const path = require('path');
const vscode = {
  commands: { registerCommand: () => ({ dispose() {} }) },
  window: { registerWebviewViewProvider: () => ({ dispose() {} }), activeTextEditor: null, showInformationMessage: () => {}, createWebviewPanel: () => ({}) },
  Uri: { joinPath: (...args) => ({ fsPath: path.join(...args) }), file: () => {} },
  ViewColumn: { One: 1 }
};
global.vscode = vscode;
require('./extension.js');
console.log('Loaded extension.js OK');
