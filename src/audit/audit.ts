import { Finding } from "../contracts/findings.js";
import { createRunStore, writeFindingArtifacts, writeRunReport, writeSurface } from "../runs/runStore.js";
import { formatRunId } from "./auditStub.js";
import { probeTargetSurface } from "./surfaceProbe.js";

export interface AuditInput {
  rootDir: string;
  targetUrl: string;
  now?: Date;
}

export interface AuditResult {
  runId: string;
  runDir: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
  surfaceJsonPath?: string;
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  const now = input.now ?? new Date();
  const runId = formatRunId(now);
  const store = createRunStore(input.rootDir);
  const findings: Finding[] = [];
  let surfaceJsonPath: string | undefined;

  try {
    const surface = await probeTargetSurface({ targetUrl: input.targetUrl });
    surfaceJsonPath = await writeSurface(store, runId, surface);
  } catch (error) {
    findings.push(createAccessFinding(runId, input.targetUrl, error));
  }

  const written = await writeRunReport(store, {
    runId,
    targetUrl: input.targetUrl,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    personas: ["beginner", "impatient", "hostile"],
    findings
  });

  await Promise.all(
    findings.map((finding) =>
      writeFindingArtifacts(store, runId, finding, {
        trace: createFindingTrace(input.targetUrl, finding),
        reproSpec: createFindingRepro(input.targetUrl, finding)
      })
    )
  );

  return {
    runId,
    runDir: written.runDir,
    reportMarkdownPath: written.reportMarkdownPath,
    findingsJsonPath: written.findingsJsonPath,
    surfaceJsonPath
  };
}

function createAccessFinding(runId: string, targetUrl: string, error: unknown): Finding {
  const message = error instanceof Error ? error.message : String(error);

  return {
    id: "finding_beginner_access_001",
    runId,
    persona: "beginner",
    severity: "high",
    confidence: "confirmed",
    mission: "Open the app and understand the first customer-facing screen.",
    claim: "The app should be reachable for a local customer audit.",
    expected: `A customer can load ${targetUrl}.`,
    actual: `The beginner customer could not reach the app: ${message}`,
    reproducibility: { status: "reproduced", attempts: 1 },
    evidence: {
      screenshots: [],
      trace: "findings/finding_beginner_access_001/trace.json",
      repro: "findings/finding_beginner_access_001/repro.spec.ts"
    },
    dedupeFingerprint: `beginner:access:${targetUrl}`
  };
}

function createFindingTrace(targetUrl: string, finding: Finding): unknown {
  return {
    findingId: finding.id,
    persona: finding.persona,
    actions: [
      {
        type: "navigate",
        targetUrl,
        actual: finding.actual
      }
    ]
  };
}

function createFindingRepro(targetUrl: string, finding: Finding): string {
  return [
    'import { test } from "@playwright/test";',
    "",
    `test("${finding.id}", async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 5000 });`,
    "});",
    ""
  ].join("\n");
}
