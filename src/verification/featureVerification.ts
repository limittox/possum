import { Browser, chromium } from "playwright";
import { LlmClient } from "../llm/client.js";
import { createRunStore, writeFindingArtifacts, writeJsonArtifact, writeRunReport } from "../runs/runStore.js";
import { formatRunId } from "../audit/auditStub.js";
import { ManagedRunCommand, startRunCommand } from "../audit/runCommand.js";
import { inferFeatureChecks } from "./checkInference.js";
import { createFeatureFinding, createFeatureFindingRepro, createFeatureFindingTrace } from "./featureFindings.js";
import { createPlaywrightVerificationPage } from "./playwrightVerificationPage.js";
import { VerificationBrowserPage, verifyFeatureCheck, verifyFeatureSetup } from "./browserVerifier.js";
import {
  FeatureCheckResult,
  FeatureVerificationBrief,
  FeatureVerificationBriefSchema,
  FeatureVerificationSummary,
  normalizeFeatureChecks
} from "./types.js";

export interface RunFeatureVerificationInput {
  rootDir: string;
  targetUrl: string;
  runCommand?: string;
  brief: FeatureVerificationBrief;
  llm: LlmClient;
  model: string;
  maxSteps: number;
  budgetMs: number;
  now?: Date;
  pageFactory?: () => Promise<VerificationBrowserPage>;
}

export interface FeatureVerificationResult {
  runId: string;
  runDir: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
  verificationJsonPath: string;
}

export async function runFeatureVerification(input: RunFeatureVerificationInput): Promise<FeatureVerificationResult> {
  const startedAt = input.now ?? new Date();
  const runId = formatRunId(startedAt);
  const store = createRunStore(input.rootDir);
  const brief = FeatureVerificationBriefSchema.parse(input.brief);
  const deadline = Date.now() + input.budgetMs;
  const browsers: Browser[] = [];
  let managedRunCommand: ManagedRunCommand | undefined;

  try {
    if (input.runCommand) {
      managedRunCommand = await startRunCommand({
        command: input.runCommand,
        cwd: input.rootDir,
        targetUrl: input.targetUrl
      });
    }

    const inferred = brief.checks.length === 0 ? await inferFeatureChecks({ brief, llm: input.llm, model: input.model }) : [];
    const checks = normalizeFeatureChecks(brief, inferred);
    const page = input.pageFactory ? await input.pageFactory() : await createDefaultPage(input.targetUrl, browsers);

    const setup = await verifyFeatureSetup({
      setup: brief.setup,
      feature: brief.feature,
      page,
      llm: input.llm,
      model: input.model,
      targetUrl: input.targetUrl,
      maxSteps: input.maxSteps,
      deadline
    });

    const checkResults: FeatureCheckResult[] = [];
    if (setup.status === "inconclusive") {
      for (const check of checks) {
        checkResults.push({
          id: check.id,
          source: check.source,
          text: check.text,
          verdict: "inconclusive",
          reason: `setup inconclusive: ${setup.reason ?? "setup did not complete"}`,
          actions: []
        });
      }
    } else {
      for (const check of checks) {
        checkResults.push(
          await verifyFeatureCheck({
            check,
            page,
            llm: input.llm,
            model: input.model,
            targetUrl: input.targetUrl,
            maxSteps: input.maxSteps,
            deadline
          })
        );
      }
    }

    const summary: FeatureVerificationSummary = {
      runType: "feature_verification",
      feature: brief.feature,
      targetUrl: input.targetUrl,
      setup,
      checks: checkResults
    };

    const failed = checkResults.filter((result) => result.verdict === "failed");
    const findings = failed.map((result, index) => createFeatureFinding({ runId, targetUrl: input.targetUrl, index, result }));

    const completedAt = new Date();
    const written = await writeRunReport(store, {
      runType: "feature_verification",
      runId,
      targetUrl: input.targetUrl,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      personas: ["feature"],
      findings
    });

    const verificationJsonPath = await writeJsonArtifact(store, runId, "verification.json", summary);

    await Promise.all(
      findings.map((finding, index) => {
        const result = failed[index];
        return writeFindingArtifacts(store, runId, finding, {
          trace: createFeatureFindingTrace(result),
          reproSpec: createFeatureFindingRepro(input.targetUrl, result)
        });
      })
    );

    return { ...written, runId, verificationJsonPath };
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()));
    await managedRunCommand?.stop();
  }
}

async function createDefaultPage(targetUrl: string, browsers: Browser[]): Promise<VerificationBrowserPage> {
  const browser = await chromium.launch();
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
  return createPlaywrightVerificationPage(page);
}
