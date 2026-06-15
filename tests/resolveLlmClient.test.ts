import { describe, expect, it } from "vitest";
import { resolveClaimVerification } from "../src/llm/resolveLlmClient.js";

describe("resolveClaimVerification", () => {
  it("returns undefined when no models are configured", () => {
    expect(resolveClaimVerification(undefined, 30)).toBeUndefined();
  });

  it("builds a claim verification config for the anthropic provider", () => {
    const resolved = resolveClaimVerification(
      { provider: "anthropic", personaModel: "agent-model", judgeModel: "judge-model" },
      25
    );

    expect(resolved).toBeDefined();
    expect(resolved?.models).toEqual({ personaModel: "agent-model", judgeModel: "judge-model" });
    expect(resolved?.maxSteps).toBe(25);
    expect(resolved?.attempts).toBe(2);
    expect(typeof resolved?.llm.complete).toBe("function");
  });

  it("throws for an unsupported provider", () => {
    expect(() => resolveClaimVerification({ provider: "openai", personaModel: "m" }, 30)).toThrow(
      /Unsupported models.provider/
    );
  });
});
