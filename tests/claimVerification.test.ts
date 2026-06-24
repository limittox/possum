import { describe, expect, it } from "vitest";
import { verifyClaimsWithStability } from "../src/audit/claimVerification.js";
import { FakeClaimPage } from "../src/audit/claimPage.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

const claims = [{ source: "homepage" as const, text: "Export your report as PDF" }];

function freshPage() {
  return new FakeClaimPage({
    "/": { url: "http://app.test/", title: "Home", headings: [], links: [], buttons: ["Refresh"], bodyText: "No export." }
  });
}

describe("verifyClaimsWithStability", () => {
  it("marks a claim reproduced when unfulfilled on every attempt", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "Export control reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." }),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." })
    ]);

    const results = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model", judgeModel: "judge-model" },
      maxSteps: 3,
      attempts: 2
    });

    expect(results).toHaveLength(1);
    expect(results[0].reproducibility).toEqual({ status: "reproduced", attempts: 2 });
    expect(results[0].result.verdict).toBe("unfulfilled");
  });

  it("marks a claim not_reproduced when attempts disagree", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "Export control reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." }),
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Found export." })
    ]);

    const results = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model" },
      maxSteps: 3,
      attempts: 2
    });

    expect(results[0].reproducibility.status).toBe("not_reproduced");
  });

  it("returns nothing when triage keeps no claims", async () => {
    const llm = new ScriptedLlmClient([JSON.stringify([{ index: 0, verifiable: false, expectedBehavior: "" }])]);
    const results = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model" },
      maxSteps: 3,
      attempts: 2
    });
    expect(results).toEqual([]);
  });
});
