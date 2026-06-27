import { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "./client.js";
import { isAbortError, LlmTimeoutError } from "./errors.js";

interface AnthropicLike {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        system?: string;
        messages: Array<{ role: "user"; content: string }>;
      },
      options?: { signal?: AbortSignal }
    ): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

type AnthropicConstructor = new (options: { apiKey?: string }) => AnthropicLike;

export interface AnthropicClientOptions {
  apiKey?: string;
  /** Inject a pre-built SDK (used in tests); when omitted the real SDK is imported lazily. */
  sdk?: AnthropicLike;
  maxTokens?: number;
  timeoutMs?: number;
}

export function createAnthropicLlmClient(options: AnthropicClientOptions = {}): LlmClient {
  let sdkPromise: Promise<AnthropicLike> | undefined;

  const getSdk = async (): Promise<AnthropicLike> => {
    if (options.sdk) {
      return options.sdk;
    }
    if (!sdkPromise) {
      // Resolve the SDK at runtime so Possum builds and tests without the optional dependency.
      const moduleName = "@anthropic-ai/sdk";
      sdkPromise = import(moduleName).then((mod) => {
        const Anthropic = (mod as { default: AnthropicConstructor }).default;
        return new Anthropic({ apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY });
      });
    }
    return sdkPromise;
  };

  return {
    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
      const sdk = await getSdk();
      const signal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
      let message: { content: Array<{ type: string; text?: string }> };
      try {
        message = await sdk.messages.create(
          {
            model: request.model,
            max_tokens: request.maxTokens ?? options.maxTokens ?? 1024,
            system: request.system,
            messages: [{ role: "user", content: request.prompt }]
          },
          signal ? { signal } : undefined
        );
      } catch (error) {
        if (isAbortError(error)) {
          throw new LlmTimeoutError();
        }
        throw error;
      }
      const text = message.content
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text ?? "")
        .join("");
      return { text };
    }
  };
}
