import { describe, expect, it } from "vitest";
import { PossumConfigSchema } from "../src/contracts/config.js";
import { FindingSchema, RunReportSchema } from "../src/contracts/findings.js";

describe("PossumConfigSchema", () => {
  it("accepts a minimal localhost audit config", () => {
    const parsed = PossumConfigSchema.parse({
      target: { url: "http://localhost:3000" },
      models: { provider: "anthropic", personaModel: "claude-3-5-haiku-latest" }
    });

    expect(parsed.target.url).toBe("http://localhost:3000");
    expect(parsed.personas).toEqual(["beginner", "impatient", "hostile", "keyboard"]);
  });
});

describe("FindingSchema", () => {
  it("requires reproducible customer evidence", () => {
    const parsed = FindingSchema.parse({
      id: "finding_beginner_onboarding_001",
      runId: "run_20260613_120000",
      persona: "beginner",
      severity: "high",
      confidence: "confirmed",
      mission: "Create the first project from the homepage claim.",
      claim: "Users can create a project in minutes.",
      expected: "A new project is created.",
      actual: "The create button silently does nothing.",
      reproducibility: { status: "reproduced", attempts: 2 },
      evidence: {
        screenshots: ["findings/finding_beginner_onboarding_001/screenshots/step-3.png"],
        trace: "findings/finding_beginner_onboarding_001/trace.json",
        repro: "findings/finding_beginner_onboarding_001/repro.spec.ts"
      },
      dedupeFingerprint: "beginner:create-project:no-op"
    });

    expect(parsed.reproducibility.attempts).toBe(2);
  });
});

describe("RunReportSchema", () => {
  it("accepts a run summary with findings", () => {
    const parsed = RunReportSchema.parse({
      runId: "run_20260613_120000",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-13T02:00:00.000Z",
      completedAt: "2026-06-13T02:01:00.000Z",
      personas: ["beginner"],
      findings: []
    });

    expect(parsed.findings).toEqual([]);
  });
});

describe("feature verification contracts", () => {
  it("accepts feature_verification run reports", () => {
    const parsed = RunReportSchema.parse({
      runType: "feature_verification",
      runId: "run_feature_1",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-28T00:00:00.000Z",
      completedAt: "2026-06-28T00:00:01.000Z",
      personas: ["feature"],
      findings: []
    });

    expect(parsed.runType).toBe("feature_verification");
  });

  it("defaults existing reports to audit run type", () => {
    const parsed = RunReportSchema.parse({
      runId: "run_audit_1",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-28T00:00:00.000Z",
      personas: ["beginner"],
      findings: []
    });

    expect(parsed.runType).toBe("audit");
  });

  it("accepts feature findings", () => {
    const parsed = FindingSchema.parse({
      id: "finding_feature_export_csv_001",
      runId: "run_feature_1",
      persona: "feature",
      severity: "high",
      confidence: "confirmed",
      mission: "Verify completed feature behavior in the browser.",
      claim: "Click Export CSV and confirm a CSV downloads",
      expected: "A CSV download starts from the Reports page.",
      actual: "No download started after clicking Export CSV.",
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: [],
        trace: "findings/finding_feature_export_csv_001/trace.json",
        repro: "findings/finding_feature_export_csv_001/repro.spec.ts"
      },
      dedupeFingerprint: "feature:run_feature_1:check_1"
    });

    expect(parsed.persona).toBe("feature");
  });
});
