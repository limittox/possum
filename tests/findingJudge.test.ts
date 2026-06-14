import { describe, expect, it } from "vitest";
import { Finding } from "../src/contracts/findings.js";
import { judgeFindings } from "../src/audit/findingJudge.js";

describe("judgeFindings", () => {
  it("accepts the first confirmed reproduced finding for each fingerprint", () => {
    const first = makeFinding({ id: "finding_one", dedupeFingerprint: "beginner:dead-end:/start" });
    const duplicate = makeFinding({ id: "finding_two", dedupeFingerprint: "beginner:dead-end:/start" });

    const result = judgeFindings([first, duplicate]);

    expect(result.accepted).toEqual([first]);
    expect(result.rejected).toEqual([
      {
        finding: duplicate,
        reason: "duplicate dedupeFingerprint beginner:dead-end:/start"
      }
    ]);
  });

  it("rejects weak or incomplete findings", () => {
    const candidate = makeFinding({ confidence: "candidate", id: "finding_candidate" });
    const notReproduced = makeFinding({
      id: "finding_not_reproduced",
      reproducibility: { attempts: 1, status: "not_reproduced" }
    });
    const missingEvidence = makeFinding({
      evidence: { repro: "", screenshots: [], trace: "" },
      id: "finding_missing_evidence"
    }) as Finding;

    const result = judgeFindings([candidate, notReproduced, missingEvidence]);

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([
      { finding: candidate, reason: "confidence is candidate" },
      { finding: notReproduced, reason: "reproducibility status is not_reproduced" },
      { finding: missingEvidence, reason: "finding schema validation failed" }
    ]);
  });
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding_beginner_dead_end_001",
    runId: "run_20260613_020000",
    persona: "beginner",
    severity: "medium",
    confidence: "confirmed",
    mission: "Find an obvious next step from the first customer-facing screen.",
    claim: "The first screen should give a new customer an obvious path forward.",
    expected: "A beginner customer can identify a link, button, or form to continue.",
    actual: "The first screen has no links, buttons, or forms.",
    reproducibility: { attempts: 1, status: "reproduced" },
    evidence: {
      repro: "findings/finding_beginner_dead_end_001/repro.spec.ts",
      screenshots: [],
      trace: "findings/finding_beginner_dead_end_001/trace.json"
    },
    dedupeFingerprint: "beginner:dead-end:http://127.0.0.1:3000",
    ...overrides
  };
}
