import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RunReport, RunReportSchema } from "../contracts/findings.js";
import { PageSurface, PageSurfaceSchema } from "../contracts/surface.js";
import { renderRunMarkdown } from "../report/renderMarkdown.js";

export interface RunStore {
  rootDir: string;
  possumDir: string;
  runsDir: string;
}

export interface WrittenRun {
  runDir: string;
  findingsJsonPath: string;
  reportMarkdownPath: string;
}

export function createRunStore(rootDir: string): RunStore {
  return {
    rootDir,
    possumDir: join(rootDir, ".possum"),
    runsDir: join(rootDir, ".possum", "runs")
  };
}

export async function writeRunReport(store: RunStore, report: RunReport): Promise<WrittenRun> {
  const parsed = RunReportSchema.parse(report);
  const runDir = join(store.runsDir, parsed.runId);
  const findingsJsonPath = join(runDir, "findings.json");
  const reportMarkdownPath = join(runDir, "report.md");

  await mkdir(runDir, { recursive: true });
  await writeFile(findingsJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await writeFile(reportMarkdownPath, renderRunMarkdown(parsed), "utf8");

  return { runDir, findingsJsonPath, reportMarkdownPath };
}

export async function writeSurface(store: RunStore, runId: string, surface: PageSurface): Promise<string> {
  const parsed = PageSurfaceSchema.parse(surface);
  const runDir = join(store.runsDir, runId);
  const surfaceJsonPath = join(runDir, "surface.json");

  await mkdir(runDir, { recursive: true });
  await writeFile(surfaceJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return surfaceJsonPath;
}
