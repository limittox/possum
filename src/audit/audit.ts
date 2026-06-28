import { join } from "node:path";
import { Browser, chromium } from "playwright";
import { Finding, RunType } from "../contracts/findings.js";
import { LlmClient } from "../llm/client.js";
import { evaluateBeginnerPersona } from "../personas/beginner.js";
import { evaluateClaimsPersona } from "../personas/claims.js";
import { evaluateHostilePersona } from "../personas/hostile.js";
import { evaluateImpatientPersona } from "../personas/impatient.js";
import { createRunStore, writeFindingArtifacts, writeRunReport, writeSurface } from "../runs/runStore.js";
import { formatRunId } from "./auditStub.js";
import { ClaimPage } from "./claimPage.js";
import { ClaimModels, verifyClaimsWithStability } from "./claimVerification.js";
import { createPlaywrightClaimPage } from "./playwrightClaimPage.js";
import { judgeFindings } from "./findingJudge.js";
import { HostileProbeResult, probeHostileValidation } from "./hostileProbe.js";
import { DoubleSubmitProbeResult, probeImpatientDoubleSubmit } from "./impatientProbe.js";
import { ManagedRunCommand, startRunCommand } from "./runCommand.js";
import { probeTargetSurface } from "./surfaceProbe.js";
import { AuditProgressEvent } from "./progress.js";

export interface AuditClaimVerification {
  llm: LlmClient;
  models: ClaimModels;
  maxSteps: number;
  attempts: number;
  budgetMs: number;
  pageFactory?: () => Promise<ClaimPage>;
}

export interface AuditInput {
  rootDir: string;
  runCommand?: string;
  targetUrl: string;
  now?: Date;
  runType?: RunType;
  claimVerification?: AuditClaimVerification;
  onProgress?: (event: AuditProgressEvent) => void;
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
  const claimBrowsers: Browser[] = [];
  const report = input.onProgress ?? (() => {});
  const total = 3 + (input.claimVerification ? 1 : 0);

  try {
    if (input.runCommand) {
      report({ type: "app-starting", command: input.runCommand });
      managedRunCommand = await startRunCommand({
        command: input.runCommand,
        cwd: input.rootDir,
        targetUrl: input.targetUrl
      });
      report({ type: "app-ready" });
    }

    const screenshotRelativePath = "personas/beginner/screenshots/first-page.png";
    const traceRelativePath = "personas/beginner/trace.json";
    const impatientTraceRelativePath = "personas/impatient/trace.json";
    const hostileTraceRelativePath = "personas/hostile/trace.json";
    report({ type: "phase-start", phase: "beginner", index: 1, total });
    const surface = await probeTargetSurface({
      rootDir: input.rootDir,
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
    const beginnerFindings = evaluateBeginnerPersona({ runId, surface });
    findings.push(...beginnerFindings);
    report({ type: "phase-done", phase: "beginner", index: 1, total, findings: beginnerFindings.length });

    report({ type: "phase-start", phase: "impatient", index: 2, total });
    impatientDoubleSubmit = await probeImpatientDoubleSubmit({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, impatientTraceRelativePath),
        relativePath: impatientTraceRelativePath
      }
    });
    const impatientFindings = evaluateImpatientPersona({ runId, doubleSubmit: impatientDoubleSubmit });
    findings.push(...impatientFindings);
    report({ type: "phase-done", phase: "impatient", index: 2, total, findings: impatientFindings.length });

    report({ type: "phase-start", phase: "hostile", index: 3, total });
    hostileValidation = await probeHostileValidation({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, hostileTraceRelativePath),
        relativePath: hostileTraceRelativePath
      }
    });
    const hostileFindings = evaluateHostilePersona({ runId, validation: hostileValidation });
    findings.push(...hostileFindings);
    report({ type: "phase-done", phase: "hostile", index: 3, total, findings: hostileFindings.length });

    if (input.claimVerification) {
      report({ type: "phase-start", phase: "claims", index: 4, total });
      const claimFindingsBefore = findings.length;
      const verification = input.claimVerification;
      const pageFactory =
        verification.pageFactory ??
        (async () => {
          const browser = await chromium.launch();
          claimBrowsers.push(browser);
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
          await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
          return createPlaywrightClaimPage(page);
        });

      const summary = await verifyClaimsWithStability({
        claims: surface.claims ?? [],
        pageFactory,
        llm: verification.llm,
        models: verification.models,
        maxSteps: verification.maxSteps,
        attempts: verification.attempts,
        budgetMs: verification.budgetMs,
        onProgress: input.onProgress
      });

      summary.confirmed.forEach((entry, index) => {
        findings.push(
          ...evaluateClaimsPersona({
            runId,
            index,
            result: entry.result,
            finalUrl: surface.finalUrl,
            reproducibility: entry.reproducibility
          })
        );
      });
      report({
        type: "phase-done",
        phase: "claims",
        index: 4,
        total,
        findings: findings.length - claimFindingsBefore
      });
    }
  } catch (error) {
    findings.push(createAccessFinding(runId, input.targetUrl, error));
  } finally {
    await Promise.all(claimBrowsers.map((browser) => browser.close()));
    await managedRunCommand?.stop();
  }

  const { accepted: acceptedFindings } = judgeFindings(findings);
  report({ type: "judge-done", accepted: acceptedFindings.length, candidates: findings.length });

  const completedAt = new Date();
  const written = await writeRunReport(store, {
    runType: input.runType ?? "audit",
    runId,
    targetUrl: input.targetUrl,
    startedAt: now.toISOString(),
    completedAt: completedAt.toISOString(),
    personas: input.claimVerification
      ? ["beginner", "impatient", "hostile", "claims"]
      : ["beginner", "impatient", "hostile"],
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
