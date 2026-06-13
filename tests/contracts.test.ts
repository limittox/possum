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
    expect(parsed.personas).toEqual(["beginner", "impatient", "hostile"]);
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
