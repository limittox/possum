import { execFile as nodeExecFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(nodeExecFile);

export interface ReplayCommand {
  command: string;
  args: string[];
}

export interface ReplayResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ReplayExecFile = (command: string, args: string[]) => Promise<ReplayResult>;

export interface RunReplayInput {
  rootDir: string;
  reproPath: string;
  execFile?: ReplayExecFile;
}

export function buildReplayCommand(rootDir: string, reproPath: string): ReplayCommand {
  const absoluteReproPath = resolve(rootDir, reproPath);
  const runConfigPath = getRunPlaywrightConfigPath(absoluteReproPath);

  if (runConfigPath) {
    return {
      command: "npx",
      args: ["playwright", "test", "--config", runConfigPath, absoluteReproPath]
    };
  }

  return {
    command: "npx",
    args: ["playwright", "test", absoluteReproPath]
  };
}

export async function runReplay(input: RunReplayInput): Promise<ReplayResult> {
  const replay = buildReplayCommand(input.rootDir, input.reproPath);
  const execFile = input.execFile ?? defaultExecFile;

  return execFile(replay.command, replay.args);
}

async function defaultExecFile(command: string, args: string[]): Promise<ReplayResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args);

    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; code?: number };

    return {
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? (error instanceof Error ? error.message : String(error)),
      exitCode: typeof failed.code === "number" ? failed.code : 1
    };
  }
}

function getRunPlaywrightConfigPath(absoluteReproPath: string): string | undefined {
  const marker = "/.possum/runs/";
  const markerIndex = absoluteReproPath.indexOf(marker);

  if (markerIndex === -1) {
    return undefined;
  }

  const afterMarker = absoluteReproPath.slice(markerIndex + marker.length);
  const [runId] = afterMarker.split("/");

  if (!runId) {
    return undefined;
  }

  return `${absoluteReproPath.slice(0, markerIndex)}${marker}${runId}/playwright.config.ts`;
}
