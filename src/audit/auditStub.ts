import { createRunStore, writeRunReport } from "../runs/runStore.js";

export interface AuditStubInput {
  rootDir: string;
  targetUrl: string;
  now?: Date;
}

export interface AuditStubResult {
  runId: string;
  runDir: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
}

export function formatRunId(now: Date): string {
  const iso = now.toISOString();
  return `run_${iso.slice(0, 10).replaceAll("-", "")}_${iso.slice(11, 19).replaceAll(":", "")}`;
}

export async function runAuditStub(input: AuditStubInput): Promise<AuditStubResult> {
  const now = input.now ?? new Date();
  const runId = formatRunId(now);
  const store = createRunStore(input.rootDir);
  const written = await writeRunReport(store, {
    runId,
    targetUrl: input.targetUrl,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    personas: ["beginner", "impatient", "hostile"],
    findings: []
  });

  return {
    runId,
    runDir: written.runDir,
    reportMarkdownPath: written.reportMarkdownPath,
    findingsJsonPath: written.findingsJsonPath
  };
}
