#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runAudit } from "../audit/audit.js";

export interface CliDependencies {
  cwd: string;
  stdout: (line: string) => void;
  now?: Date;
}

export function buildProgram(deps: CliDependencies): Command {
  const program = new Command();

  program.name("possum").description("Local customer simulator for AI-built apps.");

  program
    .command("audit")
    .description("Run a local customer audit.")
    .requiredOption("--url <url>", "Local app URL to audit")
    .action(async (options: { url: string }) => {
      const result = await runAudit({
        rootDir: deps.cwd,
        targetUrl: options.url,
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
    .description("Print a local run report.")
    .argument("<runId>", "Run id under .possum/runs")
    .action(async (runId: string) => {
      const reportPath = join(deps.cwd, ".possum", "runs", runId, "report.md");
      deps.stdout(await readFile(reportPath, "utf8"));
    });

  program
    .command("replay")
    .description("Print the Playwright command for a finding repro.")
    .argument("<reproPath>", "Path to a generated repro.spec.ts")
    .action((reproPath: string) => {
      deps.stdout(`npx playwright test ${resolve(deps.cwd, reproPath)}`);
    });

  program.command("mcp").description("Start the Possum MCP server.").action(() => {
    deps.stdout("MCP server implementation is available through src/mcp/server.ts");
  });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildProgram({
    cwd: process.cwd(),
    stdout: (line) => console.log(line)
  }).parseAsync(process.argv);
}
