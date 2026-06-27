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

    const summary = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model", judgeModel: "judge-model" },
      maxSteps: 3,
      attempts: 2,
      budgetMs: 60_000
    });

    expect(summary.confirmed).toHaveLength(1);
    expect(summary.confirmed[0].reproducibility).toEqual({ status: "reproduced", attempts: 2 });
    expect(summary.confirmed[0].result.verdict).toBe("unfulfilled");
  });

  it("marks a claim not_reproduced when attempts disagree", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "Export control reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." }),
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Found export." })
    ]);

    const summary = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model" },
      maxSteps: 3,
      attempts: 2,
      budgetMs: 60_000
    });

    expect(summary.confirmed[0].reproducibility.status).toBe("not_reproduced");
  });

  it("returns nothing when triage keeps no claims", async () => {
    const llm = new ScriptedLlmClient([JSON.stringify([{ index: 0, verifiable: false, expectedBehavior: "" }])]);
    const summary = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model" },
      maxSteps: 3,
      attempts: 2,
      budgetMs: 60_000
    });
    expect(summary.confirmed).toEqual([]);
  });

  it("skips a claim when any attempt is inconclusive", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "Export control reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." })
    ]);

    const throwingPageFactory = async () => {
      throw new Error("browser closed");
    };

    const summary = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => {
        if (llm.requests.length >= 2) {
          return throwingPageFactory();
        }
        return freshPage();
      },
      llm,
      models: { personaModel: "agent-model", judgeModel: "judge-model" },
      maxSteps: 3,
      attempts: 2,
      budgetMs: 60_000
    });

    expect(summary.confirmed).toEqual([]);
    expect(summary.processed).toBe(1);
    expect(summary.total).toBe(1);
    expect(summary.truncated).toBe(false);
  });

  it("stops before the next claim when wall-clock budget is reached", async () => {
    const twoClaims = [
      { source: "homepage" as const, text: "Export your report as PDF" },
      { source: "homepage" as const, text: "Share your report by email" }
    ];
    const llm = new ScriptedLlmClient([
      JSON.stringify([
        { index: 0, verifiable: true, expectedBehavior: "Export control reachable." },
        { index: 1, verifiable: true, expectedBehavior: "Share control reachable." }
      ]),
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Found export." })
    ]);
    let now = 1_000;
    const events: string[] = [];

    const summary = await verifyClaimsWithStability({
      claims: twoClaims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model", judgeModel: "judge-model" },
      maxSteps: 3,
      attempts: 1,
      budgetMs: 10,
      now: () => now,
      onProgress: (event) => {
        events.push(event.type);
        if (event.type === "claim-done") {
          now = 1_010;
        }
      }
    });

    expect(summary.confirmed).toEqual([]);
    expect(summary.processed).toBe(1);
    expect(summary.total).toBe(2);
    expect(summary.truncated).toBe(true);
    expect(events).toEqual(["claim-start", "claim-step", "claim-done", "claims-truncated"]);
  });
});
