import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

export type ExecFileFn = (
  file: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>;

export interface CollectGitDiffInput {
  rootDir: string;
  base?: string;
  execFile?: ExecFileFn;
}

export interface GitDiffSummary {
  source: "working-tree" | "base";
  base?: string;
  diff: string;
  changedFiles: string[];
}

const defaultExecFile: ExecFileFn = async (file, args, options) => {
  const execFile = promisify(nodeExecFile);
  const result = await execFile(file, args, { cwd: options.cwd, maxBuffer: 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

export async function collectGitDiff(input: CollectGitDiffInput): Promise<GitDiffSummary> {
  const execFile = input.execFile ?? defaultExecFile;

  if (input.base) {
    return collectBaseDiff(input.rootDir, input.base, execFile);
  }

  const workingFiles = await changedFiles(input.rootDir, ["diff", "--name-only"], execFile);
  if (workingFiles.length > 0) {
    const diff = await gitStdout(input.rootDir, ["diff", "--", ...workingFiles], execFile);
    return { source: "working-tree", diff, changedFiles: workingFiles };
  }

  for (const base of ["origin/main", "main"]) {
    const files = await changedFiles(input.rootDir, ["diff", "--name-only", `${base}...HEAD`], execFile).catch(() => []);
    if (files.length > 0) {
      const diff = await gitStdout(input.rootDir, ["diff", `${base}...HEAD`, "--", ...files], execFile);
      return { source: "base", base, diff, changedFiles: files };
    }
  }

  throw new Error("No git diff found to verify.");
}

async function collectBaseDiff(rootDir: string, base: string, execFile: ExecFileFn): Promise<GitDiffSummary> {
  const files = await changedFiles(rootDir, ["diff", "--name-only", `${base}...HEAD`], execFile);
  if (files.length === 0) {
    throw new Error(`No git diff found to verify against ${base}.`);
  }

  const diff = await gitStdout(rootDir, ["diff", `${base}...HEAD`, "--", ...files], execFile);
  return { source: "base", base, diff, changedFiles: files };
}

async function changedFiles(rootDir: string, args: string[], execFile: ExecFileFn): Promise<string[]> {
  const stdout = await gitStdout(rootDir, args, execFile);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function gitStdout(rootDir: string, args: string[], execFile: ExecFileFn): Promise<string> {
  const result = await execFile("git", args, { cwd: rootDir });
  return result.stdout;
}
