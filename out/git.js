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
exports.hasGitRepository = hasGitRepository;
exports.getDiff = getDiff;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function hasGitRepository(workspacePath) {
    try {
        const stat = await fs.promises.stat(path.join(workspacePath, ".git"));
        // .git can be a directory (normal) or a file (worktrees/submodules)
        return stat.isDirectory() || stat.isFile();
    }
    catch {
        return false;
    }
}
async function getDiff(workspacePath, useStaged) {
    const inGit = await hasGitRepository(workspacePath);
    if (!inGit)
        return undefined;
    const cmd = useStaged ? "git diff --cached" : "git diff";
    try {
        const { stdout } = await execAsync(cmd, { cwd: workspacePath, maxBuffer: 5 * 1024 * 1024 });
        const diff = stdout.trim();
        return diff.length === 0 ? undefined : diff;
    }
    catch {
        // git not installed or command failed; stay quiet per spec
        return undefined;
    }
}
//# sourceMappingURL=git.js.map