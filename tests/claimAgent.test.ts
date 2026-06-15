import { describe, expect, it } from "vitest";
import { verifyClaim } from "../src/audit/claimAgent.js";
import { FakeClaimPage } from "../src/audit/claimPage.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

const triaged = {
  claim: { source: "homepage" as const, text: "Export your report as PDF" },
  expectedBehavior: "An export-to-PDF control is reachable."
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

    const result = await verifyClaim({ triaged, page: page(), llm, model: "agent-model", maxSteps: 5 });

    expect(result.verdict).toBe("unfulfilled");
    expect(result.reason).toBe("No export control on the reports page.");
    expect(result.steps.map((step) => step.action)).toEqual(["observe", "click", "observe", "conclude"]);
  });

  it("concludes fulfilled and stops early", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Export button present on home." })
    ]);
    const result = await verifyClaim({ triaged, page: page(), llm, model: "agent-model", maxSteps: 5 });
    expect(result.verdict).toBe("fulfilled");
  });

  it("returns unfulfilled when the step budget is exhausted without a conclusion", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "click", text: "Reports" }),
      JSON.stringify({ action: "click", text: "Nowhere" })
    ]);
    const result = await verifyClaim({ triaged, page: page(), llm, model: "agent-model", maxSteps: 2 });
    expect(result.verdict).toBe("unfulfilled");
    expect(result.reason).toContain("budget");
  });
});
