import { ResolvedModelsConfig } from "../config/appConfig.js";
import { ClaimModels } from "../audit/claimVerification.js";
import { createAnthropicLlmClient } from "./anthropicClient.js";
import { LlmClient } from "./client.js";

export interface ResolvedClaimVerification {
  llm: LlmClient;
  models: ClaimModels;
  maxSteps: number;
  attempts: number;
}

const DEFAULT_ATTEMPTS = 2;

export function resolveClaimVerification(
  models: ResolvedModelsConfig,
  maxSteps: number
): ResolvedClaimVerification | undefined {
  if (!models) {
    return undefined;
  }

  if (models.provider !== "anthropic") {
    throw new Error(
      `Unsupported models.provider for claim verification: ${models.provider}. Only "anthropic" is supported.`
    );
  }

  return {
    llm: createAnthropicLlmClient(),
    models: { personaModel: models.personaModel, judgeModel: models.judgeModel },
    maxSteps,
    attempts: DEFAULT_ATTEMPTS
  };
}
