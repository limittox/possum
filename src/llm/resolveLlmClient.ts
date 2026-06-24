import { ResolvedModelsConfig } from "../config/appConfig.js";
import { ClaimModels } from "../audit/claimVerification.js";
import { createAnthropicLlmClient } from "./anthropicClient.js";
import { createOpenRouterLlmClient } from "./openRouterClient.js";
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

  return {
    llm: createLlmClient(models.provider),
    models: { personaModel: models.personaModel, judgeModel: models.judgeModel },
    maxSteps,
    attempts: DEFAULT_ATTEMPTS
  };
}

function createLlmClient(provider: NonNullable<ResolvedModelsConfig>["provider"]): LlmClient {
  switch (provider) {
    case "anthropic":
      return createAnthropicLlmClient();
    case "openrouter":
      return createOpenRouterLlmClient({ title: "Possum" });
    default:
      throw new Error(
        `Unsupported models.provider for claim verification: ${provider}. Supported providers: "anthropic", "openrouter".`
      );
  }
}
