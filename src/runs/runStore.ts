import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Finding, RunReport, RunReportSchema } from "../contracts/findings.js";
import { PageSurface, PageSurfaceSchema } from "../contracts/surface.js";
import { renderFindingMarkdown, renderRunMarkdown } from "../report/renderMarkdown.js";

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

export interface FindingArtifacts {
  trace: unknown;
  reproSpec: string;
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

export async function readRunReport(store: RunStore, runId: string): Promise<RunReport> {
  const findingsJsonPath = join(store.runsDir, runId, "findings.json");
  const raw = await readFile(findingsJsonPath, "utf8");
  return RunReportSchema.parse(JSON.parse(raw));
}

export async function readReportMarkdown(store: RunStore, runId: string): Promise<string> {
  return readFile(join(store.runsDir, runId, "report.md"), "utf8");
}

export async function readFinding(store: RunStore, runId: string, findingId: string): Promise<Finding | undefined> {
  const report = await readRunReport(store, runId);
  return report.findings.find((finding) => finding.id === findingId);
}

export async function writeFindingArtifacts(
  store: RunStore,
  runId: string,
  finding: Finding,
  artifacts: FindingArtifacts
): Promise<string> {
  const findingDir = join(store.runsDir, runId, "findings", finding.id);

  await mkdir(findingDir, { recursive: true });
  await writeFile(join(findingDir, "report.md"), renderFindingMarkdown(finding), "utf8");
  await writeFile(join(findingDir, "trace.json"), `${JSON.stringify(artifacts.trace, null, 2)}\n`, "utf8");
  await writeFile(join(findingDir, "repro.spec.ts"), artifacts.reproSpec, "utf8");

  return findingDir;
}
