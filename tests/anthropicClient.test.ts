import { describe, expect, it } from "vitest";
import { createAnthropicLlmClient } from "../src/llm/anthropicClient.js";

describe("createAnthropicLlmClient", () => {
  it("maps a completion request to the messages API and returns text", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fakeSdk = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return { content: [{ type: "text", text: "hello" }] };
        }
      }
    };

    const client = createAnthropicLlmClient({ sdk: fakeSdk });
    const response = await client.complete({ model: "model-id", system: "sys", prompt: "hi", maxTokens: 256 });

    expect(response.text).toBe("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: "model-id",
      max_tokens: 256,
      system: "sys",
      messages: [{ role: "user", content: "hi" }]
    });
  });

  it("concatenates only text blocks", async () => {
    const fakeSdk = {
      messages: {
        create: async () => ({
          content: [
            { type: "text", text: "a" },
            { type: "thinking", text: "ignored" },
            { type: "text", text: "b" }
          ]
        })
      }
    };

    const client = createAnthropicLlmClient({ sdk: fakeSdk });
    const response = await client.complete({ model: "m", prompt: "p" });
    expect(response.text).toBe("ab");
  });
});
