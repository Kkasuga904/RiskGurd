"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUnifiedDiff = parseUnifiedDiff;
exports.analyzeDiff = analyzeDiff;
// Public SSH/RDP exposure (Error)
function detectPublicAdmin(line) {
    const fileOk = /\.(tf|ya?ml|json)$/i.test(line.file);
    const world = /(0\.0\.0\.0\/0|::\/0)/;
    const adminPort = /\b(22|3389)\b/;
    if (fileOk && world.test(line.content) && adminPort.test(line.content)) {
        return {
            file: line.file,
            line: line.lineNumber,
            severity: "error",
            message: "Public SSH/RDP exposure added (0.0.0.0/0 with port 22/3389). This often causes incidents."
        };
    }
    return undefined;
}
// Kubernetes privilege escalation (Error/Warning)
function detectK8sPrivilege(line) {
    const privileged = /privileged:\s*true/i;
    const hostNetwork = /hostNetwork:\s*true/i;
    const hostPid = /hostPID:\s*true/i;
    const hostIpc = /hostIPC:\s*true/i;
    const hostPath = /\bhostPath\s*:/i;
    if (privileged.test(line.content)) {
        return {
            file: line.file,
            line: line.lineNumber,
            severity: "error",
            message: "Kubernetes privileged mode enabled (privileged: true)."
        };
    }
    if (hostNetwork.test(line.content)) {
        return {
            file: line.file,
            line: line.lineNumber,
            severity: "error",
            message: "Kubernetes hostNetwork enabled (hostNetwork: true). Review carefully."
        };
    }
    if (hostPid.test(line.content)) {
        return {
            file: line.file,
            line: line.lineNumber,
            severity: "error",
            message: "Kubernetes hostPID enabled (hostPID: true). Review carefully."
        };
    }
    if (hostIpc.test(line.content)) {
        return {
            file: line.file,
            line: line.lineNumber,
            severity: "error",
            message: "Kubernetes hostIPC enabled (hostIPC: true). Review carefully."
        };
    }
    if (hostPath.test(line.content)) {
        return {
            file: line.file,
            line: line.lineNumber,
            severity: "warn",
            message: "Kubernetes hostPath volume added (hostPath). Review carefully."
        };
    }
    return undefined;
}
function detectIam(lines) {
    const actionRe = /\bAction\b\s*[:=]\s*["']?\*(:\*|:\*)?["']?/i;
    const resourceRe = /\bResource\b\s*[:=]\s*["']?\*["']?/i;
    const results = [];
    const byFile = new Map();
    for (const line of lines) {
        if (actionRe.test(line.content)) {
            const list = byFile.get(line.file) ?? [];
            list.push({ type: "action", line });
            byFile.set(line.file, list);
        }
        else if (resourceRe.test(line.content)) {
            const list = byFile.get(line.file) ?? [];
            list.push({ type: "resource", line });
            byFile.set(line.file, list);
        }
    }
    for (const [file, wildcardLines] of byFile.entries()) {
        const actions = wildcardLines.filter(w => w.type === "action");
        const resources = wildcardLines.filter(w => w.type === "resource");
        const pairedResources = new Set();
        const pairedActions = new Set();
        for (const action of actions) {
            const partner = resources.find(r => Math.abs(r.line.lineNumber - action.line.lineNumber) <= 5);
            if (partner) {
                pairedActions.add(action.line.lineNumber);
                pairedResources.add(partner.line.lineNumber);
                results.push({
                    file,
                    line: action.line.lineNumber,
                    severity: "error",
                    message: "IAM policy appears overbroad (Action and Resource wildcard)."
                });
            }
        }
        for (const action of actions) {
            if (pairedActions.has(action.line.lineNumber))
                continue;
            results.push({
                file,
                line: action.line.lineNumber,
                severity: "warn",
                message: "IAM policy appears overbroad (Action wildcard)."
            });
        }
        for (const resource of resources) {
            if (pairedResources.has(resource.line.lineNumber))
                continue;
            results.push({
                file,
                line: resource.line.lineNumber,
                severity: "warn",
                message: "IAM policy appears overbroad (Resource wildcard)."
            });
        }
    }
    return results;
}
// Parse unified diff and return added lines with file and line numbers
function parseUnifiedDiff(diff) {
    const additions = [];
    let currentFile;
    let oldLine = 0;
    let newLine = 0;
    for (const rawLine of diff.split(/\r?\n/)) {
        if (rawLine.startsWith("diff --git")) {
            currentFile = undefined;
            continue;
        }
        if (rawLine.startsWith("+++ ")) {
            const candidate = rawLine.slice(4).trim();
            if (candidate === "/dev/null") {
                currentFile = undefined;
            }
            else {
                currentFile = candidate.startsWith("b/") ? candidate.slice(2) : candidate;
            }
            continue;
        }
        if (rawLine.startsWith("@@")) {
            const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
            if (match) {
                oldLine = parseInt(match[1], 10);
                newLine = parseInt(match[2], 10);
            }
            continue;
        }
        if (!currentFile) {
            continue;
        }
        if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
            additions.push({ file: currentFile, lineNumber: newLine || 0, content: rawLine.slice(1) });
            newLine += 1;
            continue;
        }
        if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
            oldLine += 1;
            continue;
        }
        if (rawLine.startsWith(" ")) {
            oldLine += 1;
            newLine += 1;
        }
    }
    return additions;
}
function analyzeDiff(diff) {
    const addedLines = parseUnifiedDiff(diff);
    const results = [];
    for (const line of addedLines) {
        const ssh = detectPublicAdmin(line);
        if (ssh)
            results.push(ssh);
        const kube = detectK8sPrivilege(line);
        if (kube)
            results.push(kube);
    }
    results.push(...detectIam(addedLines));
    return results;
}
//# sourceMappingURL=rules.js.map