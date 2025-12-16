"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const git_1 = require("./git");
const rules_1 = require("./rules");
let statusBarItem;
let intervalHandle;
let scanning = false;
let collection;
let scanTimer;
async function activate(context) {
    collection = vscode.languages.createDiagnosticCollection("risk-guard");
    context.subscriptions.push(collection);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = "riskGuard.scanGitDiff";
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(vscode.commands.registerCommand("riskGuard.scanGitDiff", () => scan(context)), vscode.workspace.onDidSaveTextDocument(() => requestScan(context)), vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("riskGuard.scanIntervalSeconds")) {
            schedulePeriodicScan(context);
        }
        if (e.affectsConfiguration("riskGuard.useStagedDiff")) {
            requestScan(context);
        }
    }));
    await scan(context);
    schedulePeriodicScan(context);
}
function deactivate() {
    try {
        collection?.clear();
    }
    catch { }
    statusBarItem?.dispose();
    if (intervalHandle)
        clearInterval(intervalHandle);
    if (scanTimer)
        clearTimeout(scanTimer);
}
async function scan(context) {
    if (scanning)
        return;
    scanning = true;
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            clearDiagnostics();
            return;
        }
        const workspacePath = workspaceFolder.uri.fsPath;
        const inGit = await (0, git_1.hasGitRepository)(workspacePath);
        if (!inGit) {
            clearDiagnostics();
            return;
        }
        const config = (0, config_1.getConfig)();
        const diff = await (0, git_1.getDiff)(workspacePath, config.useStagedDiff);
        if (!diff) {
            clearDiagnostics();
            return;
        }
        const results = (0, rules_1.analyzeDiff)(diff);
        applyDiagnostics(workspaceFolder, results);
        updateStatus(results);
    }
    finally {
        scanning = false;
    }
}
function schedulePeriodicScan(context) {
    const config = (0, config_1.getConfig)();
    if (intervalHandle)
        clearInterval(intervalHandle);
    intervalHandle = setInterval(() => requestScan(context), config.scanIntervalSeconds * 1000);
    context.subscriptions.push({ dispose: () => intervalHandle && clearInterval(intervalHandle) });
}
function applyDiagnostics(folder, results) {
    const byFile = new Map();
    for (const result of results) {
        const uri = vscode.Uri.file(path.join(folder.uri.fsPath, result.file));
        const startLine = Math.max(0, result.line - 1);
        const diag = new vscode.Diagnostic(new vscode.Range(startLine, 0, startLine, 0), result.message, mapSeverity(result.severity));
        const list = byFile.get(uri.fsPath) ?? [];
        list.push(diag);
        byFile.set(uri.fsPath, list);
    }
    collection.clear();
    for (const [filePath, diags] of byFile) {
        collection.set(vscode.Uri.file(filePath), diags);
    }
}
function updateStatus(results) {
    if (!statusBarItem)
        return;
    const warnCount = results.filter(r => r.severity === "warn").length;
    const errorCount = results.filter(r => r.severity === "error").length;
    if (warnCount === 0 && errorCount === 0) {
        statusBarItem.hide();
        return;
    }
    statusBarItem.text = `$(shield) Risk Guard: ${errorCount} error / ${warnCount} warn`;
    statusBarItem.tooltip = "Risk Guard scan results";
    statusBarItem.show();
}
function clearDiagnostics() {
    collection.clear();
    statusBarItem?.hide();
}
function mapSeverity(severity) {
    switch (severity) {
        case "error":
            return vscode.DiagnosticSeverity.Error;
        case "warn":
            return vscode.DiagnosticSeverity.Warning;
        default:
            return vscode.DiagnosticSeverity.Information;
    }
}
function requestScan(context) {
    if (scanTimer)
        clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(context), 400);
}
//# sourceMappingURL=extension.js.map