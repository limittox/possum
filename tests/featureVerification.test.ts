import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";
import { VerificationBrowserPage } from "../src/verification/browserVerifier.js";
import { runFeatureVerification } from "../src/verification/featureVerification.js";

class FakePage implements VerificationBrowserPage {
  async goto(): Promise<void> {}
  async observe() {
    return {
      url: "http://app.test/reports",
      title: "Reports",
      bodyText: "Reports with Export CSV",
      links: [],
      buttons: ["Export CSV"],
      inputs: []
    };
  }
  async clickText() {
    return undefined;
  }
  async fillField(): Promise<void> {}
  async press(): Promise<void> {}
}

describe("runFeatureVerification", () => {
  it("writes verification summary for a passed explicit check", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-pass-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "Export button is visible." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: [],
        checks: [{ text: "Export CSV button is visible" }]
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const summary = JSON.parse(await readFile(result.verificationJsonPath, "utf8"));
    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));

    expect(summary.checks).toHaveLength(1);
    expect(summary.checks[0]).toMatchObject({ source: "explicit", verdict: "passed" });
    expect(report.runType).toBe("feature_verification");
    expect(report.findings).toEqual([]);
  });

  it("creates a finding artifact for a failed check", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-fail-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Export CSV button is missing." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: [],
        checks: [{ text: "Export CSV button is visible" }]
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const trace = JSON.parse(await readFile(join(result.runDir, "findings", "finding_feature_check_001", "trace.json"), "utf8"));

    expect(report.findings[0]).toMatchObject({ id: "finding_feature_check_001", persona: "feature" });
    expect(trace.verdict).toBe("failed");
  });

  it("marks checks inconclusive when setup fails", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-setup-fail-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Could not log in." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: ["Log in as demo user"],
        checks: [{ text: "Export CSV button is visible" }]
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const summary = JSON.parse(await readFile(result.verificationJsonPath, "utf8"));
    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));

    expect(summary.setup.status).toBe("inconclusive");
    expect(summary.checks[0]).toMatchObject({ verdict: "inconclusive", reason: "setup inconclusive: Could not log in." });
    expect(report.findings).toEqual([]);
  });

  it("infers checks when no explicit checks are supplied", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-infer-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ text: "Export CSV button is visible", hints: { page: "/reports" } }]),
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "Export button is visible." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: [],
        checks: []
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const summary = JSON.parse(await readFile(result.verificationJsonPath, "utf8"));
    expect(summary.checks[0]).toMatchObject({ source: "inferred", text: "Export CSV button is visible" });
  });
});
