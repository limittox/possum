import { ReplayExecFile } from "../replay/replayCommand.js";

export interface DoctorDependencyInput {
  execFile?: ReplayExecFile;
}

export interface DoctorReport {
  ok: boolean;
  missing: string[];
}

export async function checkPlaywrightSystemDependencies(input: DoctorDependencyInput = {}): Promise<DoctorReport> {
  const execFile = input.execFile ?? defaultExecFile;
  const result = await execFile("ldconfig", ["-p"]);
  const missing: string[] = [];

  if (!result.stdout.includes("libasound.so.2")) {
    missing.push("libasound.so.2");
  }

  return {
    ok: missing.length === 0,
    missing
  };
}

export function renderDoctorReport(report: DoctorReport): string {
  if (report.ok) {
    return "Playwright system dependencies look ready.";
  }

  return [
    "Missing Playwright system dependencies:",
    ...report.missing.map((dependency) => `- ${dependency}`),
    "",
    "On Debian/Ubuntu, install the missing library directly:",
    "sudo apt-get update",
    "sudo apt-get install -y libasound2",
    "",
    "On newer Ubuntu releases, the package may be named:",
    "sudo apt-get install -y libasound2t64",
    "",
    "Or let Playwright install Chromium's full dependency set:",
    'sudo env "PATH=$PATH" npx playwright install-deps chromium',
    "",
    "The PATH-preserving form matters when your shell uses a newer Node.js than root;",
    "sudo may otherwise pick an older Node.js and fail on modern JavaScript syntax."
  ].join("\n");
}

async function defaultExecFile(command: string, args: string[]) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

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
