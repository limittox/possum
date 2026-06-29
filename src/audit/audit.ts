import { join } from "node:path";
import { Browser, chromium } from "playwright";
import { Finding, RunDiagnostic, RunType } from "../contracts/findings.js";
import { LlmClient } from "../llm/client.js";
import { evaluateBeginnerPersona } from "../personas/beginner.js";
import { evaluateClaimsPersona } from "../personas/claims.js";
import { evaluateHostilePersona } from "../personas/hostile.js";
import { evaluateImpatientPersona } from "../personas/impatient.js";
import { evaluateKeyboardPersona } from "../personas/keyboard.js";
import { createRunStore, writeFindingArtifacts, writeRunReport, writeSurface } from "../runs/runStore.js";
import { formatRunId } from "./auditStub.js";
import { ClaimPage } from "./claimPage.js";
import { ClaimModels, verifyClaimsWithStability } from "./claimVerification.js";
import { createPlaywrightClaimPage } from "./playwrightClaimPage.js";
import { judgeFindings } from "./findingJudge.js";
import { HostileProbeResult, probeHostileValidation } from "./hostileProbe.js";
import { DoubleSubmitProbeResult, probeImpatientDoubleSubmit } from "./impatientProbe.js";
import { KeyboardProbeResult, probeKeyboardAccess } from "./keyboardProbe.js";
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
  storageState?: string;
}

export interface AuditResult {
  runId: string;
  runDir: string;
  reportMarkdownPath: string;
  reportHtmlPath: string;
  findingsJsonPath: string;
  surfaceJsonPath?: string;
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  const now = input.now ?? new Date();
  const runId = formatRunId(now);
  const store = createRunStore(input.rootDir);
  const findings: Finding[] = [];
  const diagnostics: RunDiagnostic[] = [];
  let surfaceJsonPath: string | undefined;
  let impatientDoubleSubmit: DoubleSubmitProbeResult | undefined;
  let hostileValidation: HostileProbeResult | undefined;
  let keyboardAccess: KeyboardProbeResult | undefined;
  let managedRunCommand: ManagedRunCommand | undefined;
  const claimBrowsers: Browser[] = [];
  const report = input.onProgress ?? (() => {});
  const total = 4 + (input.claimVerification ? 1 : 0);

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
    const keyboardTraceRelativePath = "personas/keyboard/trace.json";
    report({ type: "phase-start", phase: "beginner", index: 1, total });
    const surface = await probeTargetSurface({
      rootDir: input.rootDir,
      targetUrl: input.targetUrl,
      storageState: input.storageState,
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
      storageState: input.storageState,
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
      storageState: input.storageState,
      trace: {
        absolutePath: join(store.runsDir, runId, hostileTraceRelativePath),
        relativePath: hostileTraceRelativePath
      }
    });
    const hostileFindings = evaluateHostilePersona({ runId, validation: hostileValidation });
    findings.push(...hostileFindings);
    report({ type: "phase-done", phase: "hostile", index: 3, total, findings: hostileFindings.length });

    report({ type: "phase-start", phase: "keyboard", index: 4, total });
    keyboardAccess = await probeKeyboardAccess({
      targetUrl: input.targetUrl,
      storageState: input.storageState,
      trace: {
        absolutePath: join(store.runsDir, runId, keyboardTraceRelativePath),
        relativePath: keyboardTraceRelativePath
      }
    });
    const keyboardFindings = evaluateKeyboardPersona({ runId, keyboard: keyboardAccess });
    findings.push(...keyboardFindings);
    report({ type: "phase-done", phase: "keyboard", index: 4, total, findings: keyboardFindings.length });

    if (input.claimVerification) {
      report({ type: "phase-start", phase: "claims", index: 5, total });
      const claimFindingsBefore = findings.length;
      const verification = input.claimVerification;
      const pageFactory =
        verification.pageFactory ??
        (async () => {
          const browser = await chromium.launch();
          claimBrowsers.push(browser);
          const page = await browser.newPage({
            viewport: { width: 1280, height: 720 },
            ...(input.storageState ? { storageState: input.storageState } : {})
          });
          await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
          return createPlaywrightClaimPage(page);
        });

      try {
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
        summary.inconclusiveReasons.forEach((reason) => {
          diagnostics.push(createClaimsInconclusiveDiagnostic(reason));
        });
      } catch (error) {
        // Claim verification depends on external LLM infrastructure. A triage/provider failure is inconclusive,
        // not evidence that the app is unreachable or that a claim is unfulfilled.
        diagnostics.push(createClaimsInconclusiveDiagnostic(formatUnknownError(error)));
      }

      report({
        type: "phase-done",
        phase: "claims",
        index: 5,
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
      ? ["beginner", "impatient", "hostile", "keyboard", "claims"]
      : ["beginner", "impatient", "hostile", "keyboard"],
    findings: acceptedFindings,
    ...(diagnostics.length > 0 ? { diagnostics } : {})
  });

  await Promise.all(
    acceptedFindings.map((finding) =>
      writeFindingArtifacts(store, runId, finding, {
          trace: createFindingTrace(input.targetUrl, finding, { hostileValidation, impatientDoubleSubmit, keyboardAccess }),
          reproSpec: createFindingRepro(input.targetUrl, finding)
        })
      )
  );

  return {
    runId,
    runDir: written.runDir,
    reportMarkdownPath: written.reportMarkdownPath,
    reportHtmlPath: written.reportHtmlPath,
    findingsJsonPath: written.findingsJsonPath,
    surfaceJsonPath
  };
}

function createClaimsInconclusiveDiagnostic(reason: string): RunDiagnostic {
  return { phase: "claims", status: "inconclusive", reason };
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createAccessFinding(runId: string, targetUrl: string, error: unknown): Finding {
  const message = formatUnknownError(error);

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
  context: {
    hostileValidation?: HostileProbeResult;
    impatientDoubleSubmit?: DoubleSubmitProbeResult;
    keyboardAccess?: KeyboardProbeResult;
  } = {}
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

  if (finding.id.startsWith("finding_keyboard_") && context.keyboardAccess) {
    return context.keyboardAccess;
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
  if (finding.id === "finding_keyboard_missing_name_001") {
    return createKeyboardMissingNameRepro(targetUrl, finding.id);
  }
  if (finding.id === "finding_keyboard_non_focusable_control_001") {
    return createKeyboardNonFocusableRepro(targetUrl, finding.id);
  }
  if (finding.id === "finding_keyboard_no_tabbable_control_001") {
    return createKeyboardNoTabbableRepro(targetUrl, finding.id);
  }

  return [
    'import { test } from "@playwright/test";',
    "",
    `test("${finding.id}", async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 5000 });`,
    "});",
    ""
  ].join("\n");
}

function createKeyboardMissingNameRepro(targetUrl: string, findingId: string): string {
  return createKeyboardRepro(
    targetUrl,
    findingId,
    "const failed = controls.some((control) => control.visible && !control.disabled && control.name.length === 0);"
  );
}

function createKeyboardNonFocusableRepro(targetUrl: string, findingId: string): string {
  return createKeyboardRepro(
    targetUrl,
    findingId,
    "const failed = controls.some((control) => control.visible && !control.disabled && control.customInteractive && !control.native && !control.focusable);"
  );
}

function createKeyboardNoTabbableRepro(targetUrl: string, findingId: string): string {
  return [
    'import { expect, test } from "@playwright/test";',
    "",
    `test("${findingId}", async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 5000 });`,
    "  const controls = await page.locator('a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[onclick]').count();",
    "  for (let index = 0; index < Math.min(Math.max(controls * 2, 8), 40); index += 1) {",
    "    await page.keyboard.press('Tab');",
    "  }",
    "  const activeTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());",
    "  expect(activeTag === 'body' || activeTag === 'html').toBe(true);",
    "});",
    ""
  ].join("\n");
}

function createKeyboardRepro(targetUrl: string, findingId: string, assertionLine: string): string {
  return [
    'import { expect, test } from "@playwright/test";',
    "",
    `test("${findingId}", async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 5000 });`,
    "  const failed = await page.evaluate(() => {",
    "    const controls = Array.from(document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[onclick]')).map((element) => {",
    "      const htmlElement = element;",
    "      const style = window.getComputedStyle(htmlElement);",
    "      const rect = htmlElement.getBoundingClientRect();",
    "      const text = (htmlElement.innerText || htmlElement.textContent || '').replace(/\\s+/g, ' ').trim();",
    "      const name = (htmlElement.getAttribute('aria-label') || text || htmlElement.getAttribute('title') || htmlElement.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim();",
    "      const role = htmlElement.getAttribute('role') || '';",
    "      const native = ['a', 'button', 'input', 'textarea', 'select', 'summary'].includes(htmlElement.tagName.toLowerCase());",
    "      const customInteractive = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem'].includes(role) || htmlElement.hasAttribute('onclick');",
    "      const tabindex = htmlElement.getAttribute('tabindex');",
    "      const focusable = tabindex !== null ? Number.parseInt(tabindex, 10) >= 0 : native;",
    "      return { visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0, disabled: htmlElement.hasAttribute('disabled') || htmlElement.getAttribute('aria-disabled') === 'true', name, native, customInteractive, focusable };",
    "    });",
    `    ${assertionLine}`,
    "    return failed;",
    "  });",
    "  expect(failed).toBe(true);",
    "});",
    ""
  ].join("\n");
}
