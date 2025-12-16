import * as path from "path";
import * as vscode from "vscode";
import { getConfig } from "./config";
import { getDiff, hasGitRepository } from "./git";
import { analyzeDiff, RuleResult, RuleSeverity } from "./rules";

let statusBarItem: vscode.StatusBarItem | undefined;
let intervalHandle: NodeJS.Timeout | undefined;
let scanning = false;
let collection: vscode.DiagnosticCollection;
let scanTimer: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext) {
  collection = vscode.languages.createDiagnosticCollection("risk-guard");
  context.subscriptions.push(collection);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "riskGuard.scanGitDiff";
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("riskGuard.scanGitDiff", () => scan(context)),
    vscode.workspace.onDidSaveTextDocument(() => requestScan(context)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("riskGuard.scanIntervalSeconds")) {
        schedulePeriodicScan(context);
      }
      if (e.affectsConfiguration("riskGuard.useStagedDiff")) {
        requestScan(context);
      }
    })
  );

  await scan(context);
  schedulePeriodicScan(context);
}

export function deactivate() {
  try {
    collection?.clear();
  } catch {}
  statusBarItem?.dispose();
  if (intervalHandle) clearInterval(intervalHandle);
  if (scanTimer) clearTimeout(scanTimer);
}

async function scan(context: vscode.ExtensionContext) {
  if (scanning) return;
  scanning = true;

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      clearDiagnostics();
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const inGit = await hasGitRepository(workspacePath);
    if (!inGit) {
      clearDiagnostics();
      return;
    }

    const config = getConfig();
    const diff = await getDiff(workspacePath, config.useStagedDiff);
    if (!diff) {
      clearDiagnostics();
      return;
    }

    const results = analyzeDiff(diff);
    applyDiagnostics(workspaceFolder, results);
    updateStatus(results);
  } finally {
    scanning = false;
  }
}

function schedulePeriodicScan(context: vscode.ExtensionContext) {
  const config = getConfig();
  if (intervalHandle) clearInterval(intervalHandle);

  intervalHandle = setInterval(() => requestScan(context), config.scanIntervalSeconds * 1000);
  context.subscriptions.push({ dispose: () => intervalHandle && clearInterval(intervalHandle) });
}

function applyDiagnostics(folder: vscode.WorkspaceFolder, results: RuleResult[]) {
  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const result of results) {
    const uri = vscode.Uri.file(path.join(folder.uri.fsPath, result.file));
    const startLine = Math.max(0, result.line - 1);
    const diag = new vscode.Diagnostic(
      new vscode.Range(startLine, 0, startLine, 0),
      result.message,
      mapSeverity(result.severity)
    );
    const list = byFile.get(uri.fsPath) ?? [];
    list.push(diag);
    byFile.set(uri.fsPath, list);
  }

  collection.clear();
  for (const [filePath, diags] of byFile) {
    collection.set(vscode.Uri.file(filePath), diags);
  }
}

function updateStatus(results: RuleResult[]) {
  if (!statusBarItem) return;

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

function mapSeverity(severity: RuleSeverity): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warn":
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function requestScan(context: vscode.ExtensionContext) {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => scan(context), 400);
}
