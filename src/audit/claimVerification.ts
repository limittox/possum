import { ClaimSurface } from "../contracts/surface.js";
import { LlmClient } from "../llm/client.js";
import { ClaimPage } from "./claimPage.js";
import { ClaimVerificationResult, verifyClaim } from "./claimAgent.js";
import { triageClaims } from "./claimTriage.js";

export interface ClaimModels {
  personaModel: string;
  judgeModel?: string;
}

export interface ConfirmedClaimResult {
  result: ClaimVerificationResult;
  reproducibility: { status: "reproduced" | "not_reproduced"; attempts: number };
}

export interface VerifyClaimsInput {
  claims: ClaimSurface[];
  pageFactory: () => Promise<ClaimPage>;
  llm: LlmClient;
  models: ClaimModels;
  maxSteps: number;
  attempts: number;
}

export async function verifyClaimsWithStability(input: VerifyClaimsInput): Promise<ConfirmedClaimResult[]> {
  const triaged = await triageClaims({
    claims: input.claims,
    llm: input.llm,
    model: input.models.judgeModel ?? input.models.personaModel
  });

  const confirmed: ConfirmedClaimResult[] = [];

  for (const candidate of triaged) {
    const verdicts: ClaimVerificationResult[] = [];
    for (let attempt = 0; attempt < input.attempts; attempt += 1) {
      const page = await input.pageFactory();
      verdicts.push(
        await verifyClaim({
          triaged: candidate,
          page,
          llm: input.llm,
          model: input.models.personaModel,
          maxSteps: input.maxSteps
        })
      );
    }

    if (verdicts.every((verdict) => verdict.verdict === "fulfilled")) {
      continue;
    }

    const allUnfulfilled = verdicts.every((verdict) => verdict.verdict === "unfulfilled");
    confirmed.push({
      result: verdicts[verdicts.length - 1],
      reproducibility: {
        status: allUnfulfilled ? "reproduced" : "not_reproduced",
        attempts: input.attempts
      }
    });
  }

  return confirmed;
}
