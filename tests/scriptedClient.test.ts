import { describe, expect, it } from "vitest";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

describe("ScriptedLlmClient", () => {
  it("returns scripted responses in order and records requests", async () => {
    const client = new ScriptedLlmClient(["first", "second"]);

    const a = await client.complete({ model: "test-model", prompt: "a" });
    const b = await client.complete({ model: "test-model", prompt: "b" });

    expect(a.text).toBe("first");
    expect(b.text).toBe("second");
    expect(client.requests.map((request) => request.prompt)).toEqual(["a", "b"]);
  });

  it("throws when the script is exhausted", async () => {
    const client = new ScriptedLlmClient([]);
    await expect(client.complete({ model: "test-model", prompt: "x" })).rejects.toThrow(
      "ScriptedLlmClient: no scripted response left"
    );
  });
});
