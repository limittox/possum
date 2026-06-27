import { describe, expect, it } from "vitest";
import { verifyClaim } from "../src/audit/claimAgent.js";
import { FakeClaimPage } from "../src/audit/claimPage.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

const triaged = {
  claim: { source: "homepage" as const, text: "Export your report as PDF" },
  expectedBehavior: "An export-to-PDF control is reachable."
};

const throwingLlm = {
  async complete() {
    throw new Error("provider timed out");
  }
};

function page() {
  return new FakeClaimPage({
    "/": {
      url: "http://app.test/",
      title: "Home",
      headings: ["Welcome"],
      links: [{ text: "Reports", href: "/reports" }],
      buttons: [],
      bodyText: "Welcome."
    },
    "/reports": {
      url: "http://app.test/reports",
      title: "Reports",
      headings: ["Reports"],
      links: [],
      buttons: ["Refresh"],
      bodyText: "No export control here."
    }
  });
}

describe("verifyClaim", () => {
  it("navigates then concludes the claim is unfulfilled", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "click", text: "Reports" }),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control on the reports page." })
    ]);

    const result = await verifyClaim({
      triaged,
      page: page(),
      llm,
      model: "agent-model",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("unfulfilled");
    expect(result.reason).toBe("No export control on the reports page.");
    expect(result.steps.map((step) => step.action)).toEqual(["observe", "click", "observe", "conclude"]);
  });

  it("concludes fulfilled and stops early", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Export button present on home." })
    ]);
    const result = await verifyClaim({
      triaged,
      page: page(),
      llm,
      model: "agent-model",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });
    expect(result.verdict).toBe("fulfilled");
  });

  it("returns unfulfilled when the step budget is exhausted without a conclusion", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "click", text: "Reports" }),
      JSON.stringify({ action: "click", text: "Nowhere" })
    ]);
    const result = await verifyClaim({
      triaged,
      page: page(),
      llm,
      model: "agent-model",
      maxSteps: 2,
      deadline: Date.now() + 60_000
    });
    expect(result.verdict).toBe("unfulfilled");
    expect(result.reason).toContain("budget");
  });

  it("returns inconclusive when the llm throws", async () => {
    const result = await verifyClaim({
      triaged,
      page: page(),
      llm: throwingLlm,
      model: "agent-model",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("inconclusive");
    expect(result.reason).toContain("provider timed out");
    expect(result.steps.at(-1)).toMatchObject({
      action: "conclude",
      verdict: "inconclusive"
    });
  });

  it("returns inconclusive when wall-clock budget is already reached", async () => {
    const result = await verifyClaim({
      triaged,
      page: page(),
      llm: new ScriptedLlmClient([]),
      model: "agent-model",
      maxSteps: 5,
      deadline: 1_000,
      now: () => 1_000
    });

    expect(result.verdict).toBe("inconclusive");
    expect(result.reason).toBe("wall-clock budget reached");
    expect(result.steps).toEqual([
      {
        action: "conclude",
        verdict: "inconclusive",
        reason: "wall-clock budget reached"
      }
    ]);
  });

  it("emits claim-step progress before each agent step", async () => {
    const events: Array<{ step: number; attempt: number }> = [];
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Export button present." })
    ]);

    await verifyClaim({
      triaged,
      page: page(),
      llm,
      model: "agent-model",
      maxSteps: 5,
      deadline: Date.now() + 60_000,
      progress: {
        index: 1,
        total: 1,
        attempt: 1,
        attempts: 2,
        onProgress: (event) => {
          if (event.type === "claim-step") {
            events.push({ step: event.step, attempt: event.attempt });
          }
        }
      }
    });

    expect(events).toEqual([{ step: 1, attempt: 1 }]);
  });
});
