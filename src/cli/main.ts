#!/usr/bin/env node
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../audit/audit.js";
import { POSSUM_CONFIG_FILENAME, resolveAuditTarget, writeStarterPossumConfig } from "../config/appConfig.js";
import { checkPlaywrightSystemDependencies, renderDoctorReport } from "../doctor/doctor.js";
import { startPossumMcpServer } from "../mcp/server.js";
import { ReplayExecFile, runReplay } from "../replay/replayCommand.js";

export interface CliDependencies {
  cwd: string;
  stdout: (line: string) => void;
  execFile?: ReplayExecFile;
  now?: Date;
  setExitCode?: (code: number) => void;
}

export function buildProgram(deps: CliDependencies): Command {
  const program = new Command();

  program.name("possum").description("Local customer simulator for AI-built apps.");

  program
    .command("doctor")
    .description("Check local dependencies needed by Possum.")
    .action(async () => {
      const report = await checkPlaywrightSystemDependencies({ execFile: deps.execFile });
      deps.stdout(renderDoctorReport(report));
    });

  program
    .command("init")
    .description("Create a starter possum.config.json for this app.")
    .action(async () => {
      const configPath = await writeStarterPossumConfig(deps.cwd);
      deps.stdout(`Created ${POSSUM_CONFIG_FILENAME}`);
      deps.stdout(`Config: ${configPath}`);
    });

  program
    .command("audit")
    .description("Run local customer audit.")
    .option("--url <url>", "Local app URL audit")
    .option("--command <command>", "Sandboxed command start local app before auditing")
    .action(async (options: { command?: string; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      const result = await runAudit({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        now: deps.now
      });

      deps.stdout(`Possum audit created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
      if (result.surfaceJsonPath) {
        deps.stdout(`Surface: ${result.surfaceJsonPath}`);
      }
    });

  program
    .command("report")
    .description("Print local run report.")
    .argument("<runId>", "Run id under .possum/runs")
    .action(async (runId: string) => {
      const reportPath = join(deps.cwd, ".possum", "runs", runId, "report.md");
      deps.stdout(await readFile(reportPath, "utf8"));
    });

  program
    .command("replay")
    .description("Run Playwright repro for finding.")
    .argument("<reproPath>", "Path generated repro.spec.ts")
    .action(async (reproPath: string) => {
      const result = await runReplay({ rootDir: deps.cwd, reproPath, execFile: deps.execFile });
      if (result.stdout) {
        deps.stdout(result.stdout.trimEnd());
      }
      if (result.stderr) {
        deps.stdout(result.stderr.trimEnd());
      }
      if (result.exitCode !== 0) {
        (deps.setExitCode ?? ((code: number) => (process.exitCode = code)))(result.exitCode);
      }
    });

  program.command("mcp").description("Start Possum MCP server over stdio.").action(async () => {
    await startPossumMcpServer({ rootDir: deps.cwd });
  });

  return program;
}

export function isCliEntrypoint(importMetaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) {
    return false;
  }

  return realpathSync(argvPath) === realpathSync(fileURLToPath(importMetaUrl));
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  await buildProgram({
    cwd: process.cwd(),
    stdout: (line) => console.log(line)
  }).parseAsync(process.argv);
}
