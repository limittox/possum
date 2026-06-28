import { Finding } from "../contracts/findings.js";
import { FeatureCheckResult } from "./types.js";

export interface CreateFeatureFindingInput {
  runId: string;
  targetUrl: string;
  index: number;
  result: FeatureCheckResult;
}

export function createFeatureFinding(input: CreateFeatureFindingInput): Finding {
  const id = `finding_feature_check_${String(input.index + 1).padStart(3, "0")}`;

  return {
    id,
    runId: input.runId,
    persona: "feature",
    severity: input.result.source === "explicit" ? "high" : "medium",
    confidence: "confirmed",
    mission: "Verify completed feature behavior in the browser.",
    claim: input.result.text,
    expected: `Feature check should pass: ${input.result.text}`,
    actual: input.result.reason,
    reproducibility: { status: "reproduced", attempts: 1 },
    evidence: {
      screenshots: [],
      trace: `findings/${id}/trace.json`,
      repro: `findings/${id}/repro.spec.ts`
    },
    dedupeFingerprint: `feature:${input.runId}:${input.result.id}`
  };
}

export function createFeatureFindingTrace(result: FeatureCheckResult): unknown {
  return {
    checkId: result.id,
    source: result.source,
    verdict: result.verdict,
    actions: result.actions
  };
}

export function createFeatureFindingRepro(targetUrl: string, result: FeatureCheckResult): string {
  const clickActions = result.actions.filter((action) => action.action === "click").map((action) => action.detail);
  const lines = [
    'import { test } from "@playwright/test";',
    "",
    `test(${JSON.stringify(result.text)}, async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 5000 });`
  ];

  for (const text of clickActions) {
    lines.push(`  await page.getByText(${JSON.stringify(text)}, { exact: true }).first().click();`);
  }

  lines.push("});", "");
  return lines.join("\n");
}
