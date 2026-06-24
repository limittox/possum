import { Finding } from "../contracts/findings.js";
import { ClaimVerificationResult } from "../audit/claimAgent.js";

export interface ClaimsPersonaInput {
  runId: string;
  index: number;
  result: ClaimVerificationResult;
  finalUrl: string;
  reproducibility: { status: "not_replayed" | "reproduced" | "not_reproduced"; attempts: number };
  screenshot?: string;
}

export function evaluateClaimsPersona(input: ClaimsPersonaInput): Finding[] {
  if (input.result.verdict === "fulfilled") {
    return [];
  }

  const id = `finding_claim_unfulfilled_${String(input.index + 1).padStart(3, "0")}`;
  const normalizedClaim = input.result.claim.text.replace(/\s+/gu, " ").trim().toLowerCase();

  return [
    {
      id,
      runId: input.runId,
      persona: "claims",
      severity: "medium",
      confidence: "confirmed",
      mission: "Verify the running app delivers on a claim it makes about itself.",
      claim: input.result.claim.text,
      expected: input.result.expectedBehavior,
      actual: input.result.reason,
      reproducibility: input.reproducibility,
      evidence: {
        screenshots: input.screenshot ? [input.screenshot] : [],
        trace: `findings/${id}/trace.json`,
        repro: `findings/${id}/repro.spec.ts`
      },
      dedupeFingerprint: `claims:unfulfilled:${input.finalUrl}:${normalizedClaim}`
    }
  ];
}
