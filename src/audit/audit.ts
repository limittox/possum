import { join } from "node:path";
import { Finding } from "../contracts/findings.js";
import { evaluateBeginnerPersona } from "../personas/beginner.js";
import { evaluateHostilePersona } from "../personas/hostile.js";
import { evaluateImpatientPersona } from "../personas/impatient.js";
import { createRunStore, writeFindingArtifacts, writeRunReport, writeSurface } from "../runs/runStore.js";
import { formatRunId } from "./auditStub.js";
import { judgeFindings } from "./findingJudge.js";
import { HostileProbeResult, probeHostileValidation } from "./hostileProbe.js";
import { DoubleSubmitProbeResult, probeImpatientDoubleSubmit } from "./impatientProbe.js";
import { ManagedRunCommand, startRunCommand } from "./runCommand.js";
import { probeTargetSurface } from "./surfaceProbe.js";

export interface AuditInput {
  rootDir: string;
  runCommand?: string;
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
  let impatientDoubleSubmit: DoubleSubmitProbeResult | undefined;
  let hostileValidation: HostileProbeResult | undefined;
  let managedRunCommand: ManagedRunCommand | undefined;

  try {
    if (input.runCommand) {
      managedRunCommand = await startRunCommand({
        command: input.runCommand,
        cwd: input.rootDir,
        targetUrl: input.targetUrl
      });
    }

    const screenshotRelativePath = "personas/beginner/screenshots/first-page.png";
    const traceRelativePath = "personas/beginner/trace.json";
    const impatientTraceRelativePath = "personas/impatient/trace.json";
    const hostileTraceRelativePath = "personas/hostile/trace.json";
    const surface = await probeTargetSurface({
      targetUrl: input.targetUrl,
      screenshot: {
        absolutePath: join(store.runsDir, runId, screenshotRelativePath),
        relativePath: screenshotRelativePath
      },
      trace: {
        absolutePath: join(store.runsDir, runId, traceRelativePath),
        relativePath: traceRelativePath
      }
    });
    surfaceJsonPath = await writeSurface(store, runId, surface);
    findings.push(...evaluateBeginnerPersona({ runId, surface }));

    impatientDoubleSubmit = await probeImpatientDoubleSubmit({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, impatientTraceRelativePath),
        relativePath: impatientTraceRelativePath
      }
    });
    findings.push(...evaluateImpatientPersona({ runId, doubleSubmit: impatientDoubleSubmit }));

    hostileValidation = await probeHostileValidation({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, hostileTraceRelativePath),
        relativePath: hostileTraceRelativePath
      }
    });
    findings.push(...evaluateHostilePersona({ runId, validation: hostileValidation }));
  } catch (error) {
    findings.push(createAccessFinding(runId, input.targetUrl, error));
  } finally {
    await managedRunCommand?.stop();
  }

  const { accepted: acceptedFindings } = judgeFindings(findings);

  const written = await writeRunReport(store, {
    runId,
    targetUrl: input.targetUrl,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    personas: ["beginner", "impatient", "hostile"],
    findings: acceptedFindings
  });

  await Promise.all(
    acceptedFindings.map((finding) =>
      writeFindingArtifacts(store, runId, finding, {
          trace: createFindingTrace(input.targetUrl, finding, { hostileValidation, impatientDoubleSubmit }),
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

function createFindingTrace(
  targetUrl: string,
  finding: Finding,
  context: { hostileValidation?: HostileProbeResult; impatientDoubleSubmit?: DoubleSubmitProbeResult } = {}
): unknown {
  if (finding.id === "finding_impatient_double_submit_001" && context.impatientDoubleSubmit) {
    return {
      findingId: finding.id,
      persona: finding.persona,
      actions: context.impatientDoubleSubmit.steps
    };
  }

  if (finding.id === "finding_hostile_server_error_001" && context.hostileValidation) {
    return {
      findingId: finding.id,
      persona: finding.persona,
      actions: context.hostileValidation.steps
    };
  }

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
