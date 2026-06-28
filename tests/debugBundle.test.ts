import { describe, expect, it } from "vitest";
import { createDebugBundle, renderRepairHintsMarkdown } from "../src/debug/debugBundle.js";
import { Finding } from "../src/contracts/findings.js";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding_hostile_server_error_001",
    runId: "run_1",
    persona: "hostile",
    severity: "high",
    confidence: "confirmed",
    mission: "Submit unexpected input.",
    claim: "The app should handle unexpected input.",
    expected: "Unexpected input should be rejected gracefully.",
    actual: "Submitting unexpected input returned HTTP 500.",
    reproducibility: { status: "reproduced", attempts: 1 },
    evidence: {
      screenshots: [],
      trace: "findings/finding_hostile_server_error_001/trace.json",
      repro: "findings/finding_hostile_server_error_001/repro.spec.ts"
    },
    dedupeFingerprint: "hostile:error",
    ...overrides
  };
}

describe("debug bundle", () => {
  it("creates hostile server error repair hints and preserves trace actions", () => {
    const bundle = createDebugBundle({
      finding: finding(),
      trace: {
        actions: [
          { type: "fill", target: "email", value: "unexpected input" },
          { type: "submit", actual: "HTTP 500" }
        ]
      }
    });

    expect(bundle).toMatchObject({
      findingId: "finding_hostile_server_error_001",
      persona: "hostile",
      severity: "high",
      summary: "Submitting unexpected input returned HTTP 500.",
      artifacts: {
        report: "findings/finding_hostile_server_error_001/report.md",
        trace: "findings/finding_hostile_server_error_001/trace.json",
        repro: "findings/finding_hostile_server_error_001/repro.spec.ts",
        repairHints: "findings/finding_hostile_server_error_001/repair-hints.md"
      }
    });
    expect(bundle.timeline).toEqual([
      { type: "fill", target: "email", value: "unexpected input" },
      { type: "submit", actual: "HTTP 500" }
    ]);
    expect(bundle.repairHints).toContain("Inspect validation and error handling for unexpected input.");
  });

  it("creates duplicate submission repair hints for impatient findings", () => {
    const bundle = createDebugBundle({
      finding: finding({
        id: "finding_impatient_double_submit_001",
        persona: "impatient",
        actual: "The form submitted 2 times from rapid clicks.",
        evidence: {
          screenshots: [],
          trace: "findings/finding_impatient_double_submit_001/trace.json",
          repro: "findings/finding_impatient_double_submit_001/repro.spec.ts"
        }
      }),
      trace: { actions: [] }
    });

    expect(bundle.repairHints).toContain("Inspect duplicate-submit guards, disabled states, debouncing, or idempotency for the submitted action.");
  });

  it("creates feature verification repair hints for feature findings", () => {
    const bundle = createDebugBundle({
      finding: finding({
        id: "finding_feature_check_001",
        persona: "feature",
        actual: "The expected export button was not visible.",
        evidence: {
          screenshots: [],
          trace: "findings/finding_feature_check_001/trace.json",
          repro: "findings/finding_feature_check_001/repro.spec.ts"
        }
      }),
      trace: { actions: [] }
    });

    expect(bundle.repairHints).toContain("Inspect the feature flow and rerun `possum verify-feature` or `possum verify-diff` after fixing it.");
  });

  it("renders repair hints markdown with artifact references", () => {
    const bundle = createDebugBundle({ finding: finding(), trace: { actions: [] } });

    expect(renderRepairHintsMarkdown(bundle)).toContain("# Repair hints for finding_hostile_server_error_001");
    expect(renderRepairHintsMarkdown(bundle)).toContain("## Suggested next steps");
    expect(renderRepairHintsMarkdown(bundle)).toContain("- Trace: trace.json");
    expect(renderRepairHintsMarkdown(bundle)).toContain("- Repro: repro.spec.ts");
  });
});
