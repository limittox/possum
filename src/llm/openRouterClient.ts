import { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "./client.js";
import { isAbortError, LlmTimeoutError } from "./errors.js";

interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<FetchResponseLike>;

export interface OpenRouterClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  maxTokens?: number;
  timeoutMs?: number;
  /** Optional attribution headers surfaced on OpenRouter leaderboards. */
  referer?: string;
  title?: string;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterLlmClient(options: OpenRouterClientOptions = {}): LlmClient {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  return {
    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
      const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OpenRouter requires OPENROUTER_API_KEY to be set.");
      }

      const messages: Array<{ role: "system" | "user"; content: string }> = [];
      if (request.system) {
        messages.push({ role: "system", content: request.system });
      }
      messages.push({ role: "user", content: request.prompt });

      const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      };
      if (options.referer) {
        headers["http-referer"] = options.referer;
      }
      if (options.title) {
        headers["x-title"] = options.title;
      }

      let response: FetchResponseLike;
      try {
        response = await fetchImpl(`${options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: request.model,
            max_tokens: request.maxTokens ?? options.maxTokens ?? 1024,
            messages
          }),
          signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new LlmTimeoutError();
        }
        throw error;
      }

      if (!response.ok) {
        throw new Error(`OpenRouter request failed with HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { text: data.choices?.[0]?.message?.content ?? "" };
    }
  };
}
