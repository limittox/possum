import { describe, expect, it } from "vitest";
import { FindingSchema } from "../src/contracts/findings.js";
import { evaluateClaimsPersona } from "../src/personas/claims.js";
import { ClaimVerificationResult } from "../src/audit/claimAgent.js";

const unfulfilled: ClaimVerificationResult = {
  claim: { source: "homepage", text: "Export your report as PDF" },
  expectedBehavior: "An export-to-PDF control is reachable.",
  verdict: "unfulfilled",
  reason: "No export control on the reports page.",
  steps: [{ action: "observe", url: "http://app.test/" }]
};

describe("evaluateClaimsPersona", () => {
  it("builds a schema-valid finding for an unfulfilled claim", () => {
    const findings = evaluateClaimsPersona({
      runId: "run_1",
      index: 0,
      result: unfulfilled,
      finalUrl: "http://app.test/",
      reproducibility: { status: "reproduced", attempts: 2 }
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(() => FindingSchema.parse(finding)).not.toThrow();
    expect(finding.id).toBe("finding_claim_unfulfilled_001");
    expect(finding.persona).toBe("claims");
    expect(finding.confidence).toBe("confirmed");
    expect(finding.dedupeFingerprint).toBe("claims:unfulfilled:http://app.test/:export your report as pdf");
  });

  it("returns no finding when the claim is fulfilled", () => {
    const findings = evaluateClaimsPersona({
      runId: "run_1",
      index: 0,
      result: { ...unfulfilled, verdict: "fulfilled" },
      finalUrl: "http://app.test/",
      reproducibility: { status: "reproduced", attempts: 2 }
    });
    expect(findings).toEqual([]);
  });
});
