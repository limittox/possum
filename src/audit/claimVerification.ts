import { ClaimSurface } from "../contracts/surface.js";
import { LlmClient } from "../llm/client.js";
import { ClaimPage } from "./claimPage.js";
import { ClaimVerificationResult, verifyClaim } from "./claimAgent.js";
import { AuditProgressReporter } from "./progress.js";
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
  budgetMs: number;
  now?: () => number;
  onProgress?: AuditProgressReporter;
}

export interface VerifyClaimsSummary {
  confirmed: ConfirmedClaimResult[];
  processed: number;
  total: number;
  truncated: boolean;
  inconclusiveReasons: string[];
}

export async function verifyClaimsWithStability(input: VerifyClaimsInput): Promise<VerifyClaimsSummary> {
  const triaged = await triageClaims({
    claims: input.claims,
    llm: input.llm,
    model: input.models.judgeModel ?? input.models.personaModel
  });

  const now = input.now ?? Date.now;
  const deadline = now() + input.budgetMs;
  const confirmed: ConfirmedClaimResult[] = [];
  const inconclusiveReasons: string[] = [];
  let processed = 0;
  let truncated = false;

  for (const [claimIndex, candidate] of triaged.entries()) {
    if (now() >= deadline) {
      truncated = true;
      inconclusiveReasons.push(`claim verification budget reached after ${processed}/${triaged.length} claims`);
      input.onProgress?.({ type: "claims-truncated", processed, total: triaged.length });
      break;
    }

    input.onProgress?.({
      type: "claim-start",
      index: claimIndex + 1,
      total: triaged.length,
      claim: candidate.claim.text
    });

    const verdicts: ClaimVerificationResult[] = [];
    for (let attempt = 0; attempt < input.attempts; attempt += 1) {
      try {
        const page = await input.pageFactory();
        verdicts.push(
          await verifyClaim({
            triaged: candidate,
            page,
            llm: input.llm,
            model: input.models.personaModel,
            maxSteps: input.maxSteps,
            deadline,
            now,
            progress: input.onProgress
              ? {
                  index: claimIndex + 1,
                  total: triaged.length,
                  attempt: attempt + 1,
                  attempts: input.attempts,
                  onProgress: input.onProgress
                }
              : undefined
          })
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        verdicts.push({
          claim: candidate.claim,
          expectedBehavior: candidate.expectedBehavior,
          verdict: "inconclusive",
          reason,
          steps: [{ action: "conclude", verdict: "inconclusive", reason }]
        });
      }
    }

    processed += 1;
    const last = verdicts[verdicts.length - 1];
    if (!last) {
      continue;
    }

    input.onProgress?.({
      type: "claim-done",
      index: claimIndex + 1,
      total: triaged.length,
      verdict: last.verdict
    });

    if (verdicts.some((verdict) => verdict.verdict === "inconclusive")) {
      inconclusiveReasons.push(last.reason);
      continue;
    }
    if (verdicts.every((verdict) => verdict.verdict === "fulfilled")) {
      continue;
    }

    const allUnfulfilled = verdicts.every((verdict) => verdict.verdict === "unfulfilled");
    confirmed.push({
      result: last,
      reproducibility: {
        status: allUnfulfilled ? "reproduced" : "not_reproduced",
        attempts: input.attempts
      }
    });
  }

  return { confirmed, processed, total: triaged.length, truncated, inconclusiveReasons: uniqueStrings(inconclusiveReasons) };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
