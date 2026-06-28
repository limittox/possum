import { describe, expect, it } from "vitest";
import { createFeatureFinding, createFeatureFindingRepro, createFeatureFindingTrace } from "../src/verification/featureFindings.js";
import { FeatureCheckResult } from "../src/verification/types.js";

const failedResult: FeatureCheckResult = {
  id: "check_1",
  source: "explicit",
  text: "Click Export CSV and confirm a CSV downloads",
  verdict: "failed",
  reason: "No download started after clicking Export CSV.",
  actions: [
    { action: "observe", detail: "Reports", url: "http://app.test/reports" },
    { action: "click", detail: "Export CSV" },
    { action: "conclude", detail: "No download started after clicking Export CSV.", evidence: { verdict: "failed" } }
  ]
};

describe("createFeatureFinding", () => {
  it("maps failed explicit checks to high severity feature findings", () => {
    const finding = createFeatureFinding({
      runId: "run_1",
      targetUrl: "http://app.test",
      index: 0,
      result: failedResult
    });

    expect(finding).toMatchObject({
      id: "finding_feature_check_001",
      runId: "run_1",
      persona: "feature",
      severity: "high",
      confidence: "confirmed",
      claim: "Click Export CSV and confirm a CSV downloads",
      expected: "Feature check should pass: Click Export CSV and confirm a CSV downloads",
      actual: "No download started after clicking Export CSV.",
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: [],
        trace: "findings/finding_feature_check_001/trace.json",
        repro: "findings/finding_feature_check_001/repro.spec.ts"
      },
      dedupeFingerprint: "feature:run_1:check_1"
    });
  });

  it("maps failed inferred checks to medium severity", () => {
    const finding = createFeatureFinding({
      runId: "run_1",
      targetUrl: "http://app.test",
      index: 1,
      result: { ...failedResult, id: "check_2", source: "inferred" }
    });

    expect(finding.id).toBe("finding_feature_check_002");
    expect(finding.severity).toBe("medium");
  });
});

describe("feature finding artifacts", () => {
  it("creates trace from check actions", () => {
    expect(createFeatureFindingTrace(failedResult)).toEqual({
      checkId: "check_1",
      source: "explicit",
      verdict: "failed",
      actions: failedResult.actions
    });
  });

  it("creates a basic repro spec", () => {
    expect(createFeatureFindingRepro("http://app.test", failedResult)).toContain(
      'await page.goto("http://app.test", { waitUntil: "domcontentloaded", timeout: 5000 });'
    );
    expect(createFeatureFindingRepro("http://app.test", failedResult)).toContain("Export CSV");
  });
});
