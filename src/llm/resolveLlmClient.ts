import { ResolvedModelsConfig } from "../config/appConfig.js";
import { ClaimModels } from "../audit/claimVerification.js";
import { createAnthropicLlmClient } from "./anthropicClient.js";
import { createOpenRouterLlmClient } from "./openRouterClient.js";
import { LlmClient } from "./client.js";

export interface ResolveClaimVerificationOptions {
  requestTimeoutMs: number;
  budgetMs: number;
}

export interface ResolvedClaimVerification {
  llm: LlmClient;
  models: ClaimModels;
  maxSteps: number;
  attempts: number;
  budgetMs: number;
}

const DEFAULT_ATTEMPTS = 2;

export function resolveClaimVerification(
  models: ResolvedModelsConfig,
  maxSteps: number,
  options: ResolveClaimVerificationOptions
): ResolvedClaimVerification | undefined {
  if (!models) {
    return undefined;
  }

  return {
    llm: createLlmClient(models.provider, options.requestTimeoutMs),
    models: { personaModel: models.personaModel, judgeModel: models.judgeModel },
    maxSteps,
    attempts: DEFAULT_ATTEMPTS,
    budgetMs: options.budgetMs
  };
}

function createLlmClient(provider: NonNullable<ResolvedModelsConfig>["provider"], timeoutMs: number): LlmClient {
  switch (provider) {
    case "anthropic":
      return createAnthropicLlmClient({ timeoutMs });
    case "openrouter":
      return createOpenRouterLlmClient({ title: "Possum", timeoutMs });
    default:
      throw new Error(
        `Unsupported models.provider for claim verification: ${provider}. Supported providers: "anthropic", "openrouter".`
      );
  }
}
