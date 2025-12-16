import * as vscode from "vscode";

export interface RiskGuardConfig {
  useStagedDiff: boolean;
  scanIntervalSeconds: number;
}

export function getConfig(): RiskGuardConfig {
  const config = vscode.workspace.getConfiguration("riskGuard");
  const interval = Math.max(5, config.get<number>("scanIntervalSeconds", 30));
  return {
    useStagedDiff: config.get<boolean>("useStagedDiff", false),
    scanIntervalSeconds: interval
  };
}
