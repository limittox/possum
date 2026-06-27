import { describe, expect, it } from "vitest";
import { resolveClaimVerification } from "../src/llm/resolveLlmClient.js";

describe("resolveClaimVerification", () => {
  const defaultOptions = { requestTimeoutMs: 60_000, budgetMs: 300_000 };

  it("returns undefined when no models are configured", () => {
    expect(resolveClaimVerification(undefined, 30, defaultOptions)).toBeUndefined();
  });

  it("builds a claim verification config for the anthropic provider", () => {
    const resolved = resolveClaimVerification(
      { provider: "anthropic", personaModel: "agent-model", judgeModel: "judge-model" },
      25,
      defaultOptions
    );

    expect(resolved).toBeDefined();
    expect(resolved?.models).toEqual({ personaModel: "agent-model", judgeModel: "judge-model" });
    expect(resolved?.maxSteps).toBe(25);
    expect(resolved?.attempts).toBe(2);
    expect(typeof resolved?.llm.complete).toBe("function");
  });

  it("builds a claim verification config for the openrouter provider", () => {
    const resolved = resolveClaimVerification(
      { provider: "openrouter", personaModel: "openai/gpt-4o" },
      30,
      defaultOptions
    );

    expect(resolved).toBeDefined();
    expect(resolved?.models).toEqual({ personaModel: "openai/gpt-4o", judgeModel: undefined });
    expect(typeof resolved?.llm.complete).toBe("function");
  });

  it("includes request timeout and wall-clock budget in claim verification config", () => {
    const resolved = resolveClaimVerification(
      { provider: "openrouter", personaModel: "openai/gpt-4o" },
      25,
      { requestTimeoutMs: 7_000, budgetMs: 120_000 }
    );

    expect(resolved).toBeDefined();
    expect(resolved?.maxSteps).toBe(25);
    expect(resolved?.budgetMs).toBe(120_000);
    expect(resolved?.attempts).toBe(2);
  });

  it("throws for an unsupported provider", () => {
    expect(() => resolveClaimVerification({ provider: "openai", personaModel: "m" }, 30, defaultOptions)).toThrow(
      /Unsupported models.provider/
    );
  });
});
