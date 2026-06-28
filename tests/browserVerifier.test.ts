import { describe, expect, it } from "vitest";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";
import { VerificationBrowserPage, verifyFeatureCheck, verifyFeatureSetup } from "../src/verification/browserVerifier.js";
import { VerificationCheck } from "../src/verification/types.js";

class FakeVerificationPage implements VerificationBrowserPage {
  public readonly clicked: string[] = [];
  public readonly filled: Array<{ target: string; value: string }> = [];
  public readonly pressed: string[] = [];
  public readonly visited: string[] = [];

  constructor(private readonly bodyText = "Reports page with Export CSV button") {}

  async goto(pathOrUrl: string): Promise<void> {
    this.visited.push(pathOrUrl);
  }

  async observe() {
    return {
      url: "http://app.test/reports",
      title: "Reports",
      bodyText: this.bodyText,
      links: [],
      buttons: ["Export CSV"],
      inputs: []
    };
  }

  async clickText(text: string, options?: { expectDownload?: boolean }) {
    this.clicked.push(text);
    return options?.expectDownload ? { downloadSuggestedFilename: "reports.csv" } : undefined;
  }

  async fillField(target: string, value: string): Promise<void> {
    this.filled.push({ target, value });
  }

  async press(key: string): Promise<void> {
    this.pressed.push(key);
  }
}

const check: VerificationCheck = {
  id: "check_1",
  source: "explicit",
  text: "Click Export CSV and confirm a CSV downloads",
  pages: ["/reports"],
  hints: { clickText: "Export CSV", expectedDownload: ".csv" }
};

describe("verifyFeatureCheck", () => {
  it("returns passed when the verifier concludes passed", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "CSV download was observed." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("passed");
    expect(result.reason).toBe("CSV download was observed.");
    expect(result.actions.map((action) => action.action)).toEqual(["observe", "conclude"]);
  });

  it("executes click actions and records download evidence", async () => {
    const page = new FakeVerificationPage();
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "click", text: "Export CSV", expectDownload: true }),
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "Download filename reports.csv was observed." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page,
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(page.clicked).toEqual(["Export CSV"]);
    expect(result.actions).toContainEqual({
      action: "click",
      detail: "Export CSV",
      evidence: { downloadSuggestedFilename: "reports.csv" }
    });
  });

  it("returns failed when the verifier concludes failed", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Export CSV button is missing." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage("Reports page without export"),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("failed");
    expect(result.reason).toContain("missing");
  });

  it("returns inconclusive on provider errors", async () => {
    const llm = {
      async complete() {
        throw new Error("provider timed out");
      }
    };

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("inconclusive");
    expect(result.reason).toContain("provider timed out");
  });

  it("blocks cross-origin navigation", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "goto", path: "https://evil.test/phish" }),
      JSON.stringify({ action: "conclude", verdict: "inconclusive", reason: "Could not verify without leaving the app." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.actions).toContainEqual({
      action: "blocked-navigation",
      detail: "https://evil.test/phish"
    });
  });
});

describe("verifyFeatureSetup", () => {
  it("returns skipped when no setup instructions are provided", async () => {
    const result = await verifyFeatureSetup({
      setup: [],
      feature: "Added CSV export",
      page: new FakeVerificationPage(),
      llm: new ScriptedLlmClient([]),
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result).toEqual({ status: "skipped", actions: [] });
  });

  it("maps failed setup conclusion to inconclusive", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Could not log in." })
    ]);

    const result = await verifyFeatureSetup({
      setup: ["Log in as demo user"],
      feature: "Added CSV export",
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.status).toBe("inconclusive");
    expect(result.reason).toBe("Could not log in.");
  });
});
