import { describe, expect, it } from "vitest";
import { LlmTimeoutError } from "../src/llm/errors.js";
import { createOpenRouterLlmClient, FetchLike } from "../src/llm/openRouterClient.js";

function okFetch(body: unknown): { fetchImpl: FetchLike; calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> } {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, async text() { return ""; }, async json() { return body; } };
  };
  return { fetchImpl, calls };
}

describe("createOpenRouterLlmClient", () => {
  it("posts an OpenAI-compatible request and returns the message content", async () => {
    const { fetchImpl, calls } = okFetch({ choices: [{ message: { content: "hello" } }] });
    const client = createOpenRouterLlmClient({ apiKey: "key-123", fetchImpl, title: "Possum" });

    const response = await client.complete({ model: "openai/gpt-4o", system: "sys", prompt: "hi", maxTokens: 256 });

    expect(response.text).toBe("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0].init.headers.authorization).toBe("Bearer key-123");
    expect(calls[0].init.headers["x-title"]).toBe("Possum");
    expect(JSON.parse(calls[0].init.body)).toMatchObject({
      model: "openai/gpt-4o",
      max_tokens: 256,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" }
      ]
    });
  });

  it("throws a descriptive error on a non-ok response", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 402,
      async text() { return "insufficient credits"; },
      async json() { return {}; }
    });
    const client = createOpenRouterLlmClient({ apiKey: "key", fetchImpl });

    await expect(client.complete({ model: "m", prompt: "p" })).rejects.toThrow(
      "OpenRouter request failed with HTTP 402: insufficient credits"
    );
  });

  it("throws when no API key is available", async () => {
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const client = createOpenRouterLlmClient({ fetchImpl: okFetch({}).fetchImpl });
      await expect(client.complete({ model: "m", prompt: "p" })).rejects.toThrow("OPENROUTER_API_KEY");
    } finally {
      if (previous !== undefined) {
        process.env.OPENROUTER_API_KEY = previous;
      }
    }
  });

  it("passes abort signal when timeout is configured", async () => {
    const { fetchImpl, calls } = okFetch({ choices: [{ message: { content: "hello" } }] });
    const client = createOpenRouterLlmClient({
      apiKey: "key-123",
      fetchImpl,
      timeoutMs: 50
    });

    await client.complete({ model: "openai/gpt-4o", prompt: "hi" });

    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps abort failures to LlmTimeoutError", async () => {
    const fetchImpl: FetchLike = async (_url, init) => {
      await new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
      throw new Error("unreachable");
    };

    const client = createOpenRouterLlmClient({
      apiKey: "key-123",
      fetchImpl,
      timeoutMs: 1
    });

    await expect(client.complete({ model: "openai/gpt-4o", prompt: "hi" })).rejects.toBeInstanceOf(LlmTimeoutError);
  });
});
