import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function hasGitRepository(workspacePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(path.join(workspacePath, ".git"));
    // .git can be a directory (normal) or a file (worktrees/submodules)
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

export async function getDiff(workspacePath: string, useStaged: boolean): Promise<string | undefined> {
  const inGit = await hasGitRepository(workspacePath);
  if (!inGit) return undefined;

  const cmd = useStaged ? "git diff --cached" : "git diff";

  try {
    const { stdout } = await execAsync(cmd, { cwd: workspacePath, maxBuffer: 5 * 1024 * 1024 });
    const diff = stdout.trim();
    return diff.length === 0 ? undefined : diff;
  } catch {
    // git not installed or command failed; stay quiet per spec
    return undefined;
  }
}
