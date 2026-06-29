import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/audit.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(
      [
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" />",
        "<title>Export your report as PDF</title></head><body>",
        "<h1>Export your report as PDF</h1>",
        "<p>Your report is ready to view.</p>",
        "<a href=\"/\">Home</a>",
        "</body></html>"
      ].join("")
    );
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("runAudit with claim verification", () => {
  it("writes a claim-unfulfilled finding when models are supplied", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-"));

    // Triage keeps the export claim (index 0); both stability attempts conclude unfulfilled.
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "An export-to-PDF control is reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." }),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." })
    ]);

    const result = await runAudit({
      rootDir,
      targetUrl: baseUrl,
      claimVerification: {
        llm,
        models: { personaModel: "agent-model", judgeModel: "judge-model" },
        maxSteps: 3,
        attempts: 2,
        budgetMs: 60_000
      }
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const claimFinding = report.findings.find(
      (finding: { id: string }) => finding.id === "finding_claim_unfulfilled_001"
    );

    expect(claimFinding).toBeDefined();
    expect(claimFinding.persona).toBe("claims");
    expect(claimFinding.reproducibility).toEqual({ status: "reproduced", attempts: 2 });
    expect(report.personas).toEqual(["beginner", "impatient", "hostile", "keyboard", "claims"]);
  }, 30_000);

  it("does not run claim verification when models are absent", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-off-"));

    const result = await runAudit({ rootDir, targetUrl: baseUrl });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const claimFindings = report.findings.filter((finding: { persona: string }) => finding.persona === "claims");
    expect(claimFindings).toHaveLength(0);
    expect(report.personas).toEqual(["beginner", "impatient", "hostile", "keyboard"]);
  }, 30_000);

  it("records a completion timestamp distinct from the start time", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-clock-"));
    const startedAt = new Date("2020-01-01T00:00:00.000Z");

    const result = await runAudit({ rootDir, targetUrl: baseUrl, now: startedAt });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    expect(report.startedAt).toBe(startedAt.toISOString());
    expect(report.completedAt).toBeDefined();
    expect(report.completedAt).not.toBe(report.startedAt);
    expect(new Date(report.completedAt).getTime()).toBeGreaterThan(new Date(report.startedAt).getTime());
  }, 30_000);

  it("reports per-phase progress events in order", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-progress-"));

    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "An export-to-PDF control is reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." }),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." })
    ]);

    const events: import("../src/audit/progress.js").AuditProgressEvent[] = [];

    await runAudit({
      rootDir,
      targetUrl: baseUrl,
      onProgress: (event) => events.push(event),
      claimVerification: {
        llm,
        models: { personaModel: "agent-model", judgeModel: "judge-model" },
        maxSteps: 3,
        attempts: 2,
        budgetMs: 60_000
      }
    });

    expect(events).toEqual([
      { type: "phase-start", phase: "beginner", index: 1, total: 5 },
      { type: "phase-done", phase: "beginner", index: 1, total: 5, findings: 0 },
      { type: "phase-start", phase: "impatient", index: 2, total: 5 },
      { type: "phase-done", phase: "impatient", index: 2, total: 5, findings: 0 },
      { type: "phase-start", phase: "hostile", index: 3, total: 5 },
      { type: "phase-done", phase: "hostile", index: 3, total: 5, findings: 0 },
      { type: "phase-start", phase: "keyboard", index: 4, total: 5 },
      { type: "phase-done", phase: "keyboard", index: 4, total: 5, findings: 0 },
      { type: "phase-start", phase: "claims", index: 5, total: 5 },
      { type: "claim-start", index: 1, total: 1, claim: "Export your report as PDF" },
      { type: "claim-step", index: 1, total: 1, attempt: 1, attempts: 2, step: 1, maxSteps: 3 },
      { type: "claim-step", index: 1, total: 1, attempt: 2, attempts: 2, step: 1, maxSteps: 3 },
      { type: "claim-done", index: 1, total: 1, verdict: "unfulfilled" },
      { type: "phase-done", phase: "claims", index: 5, total: 5, findings: 1 },
      { type: "judge-done", accepted: 1, candidates: 1 }
    ]);
  }, 30_000);

  it("completes audit without claim finding when claim verification is inconclusive", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-inconclusive-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "An export-to-PDF control is reachable." }])
    ]);
    const throwingLlm = {
      requests: llm.requests,
      async complete(request: Parameters<typeof llm.complete>[0]) {
        if (request.model === "judge-model") {
          return llm.complete(request);
        }
        throw new Error("provider timed out");
      }
    };

    const result = await runAudit({
      rootDir,
      targetUrl: baseUrl,
      claimVerification: {
        llm: throwingLlm,
        models: { personaModel: "agent-model", judgeModel: "judge-model" },
        maxSteps: 3,
        attempts: 2,
        budgetMs: 60_000
      }
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const markdown = await readFile(result.reportMarkdownPath, "utf8");

    expect(report.personas).toEqual(["beginner", "impatient", "hostile", "keyboard", "claims"]);
    expect(report.findings.some((finding: { persona: string }) => finding.persona === "claims")).toBe(false);
    expect(report.diagnostics).toEqual([
      {
        phase: "claims",
        status: "inconclusive",
        reason: "provider timed out"
      }
    ]);
    expect(markdown).toContain("Claims: inconclusive — provider timed out");
  }, 30_000);

  it("does not convert claim triage failures into beginner access findings", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-triage-error-"));
    const events: import("../src/audit/progress.js").AuditProgressEvent[] = [];
    const throwingLlm = {
      async complete() {
        throw new Error("claim triage timed out");
      }
    };

    const result = await runAudit({
      rootDir,
      targetUrl: baseUrl,
      onProgress: (event) => events.push(event),
      claimVerification: {
        llm: throwingLlm,
        models: { personaModel: "agent-model", judgeModel: "judge-model" },
        maxSteps: 3,
        attempts: 2,
        budgetMs: 60_000
      }
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const markdown = await readFile(result.reportMarkdownPath, "utf8");

    expect(report.personas).toEqual(["beginner", "impatient", "hostile", "keyboard", "claims"]);
    expect(report.findings).toEqual([]);
    expect(report.diagnostics).toEqual([
      {
        phase: "claims",
        status: "inconclusive",
        reason: "claim triage timed out"
      }
    ]);
    expect(markdown).toContain("Claims: inconclusive — claim triage timed out");
    expect(events).toContainEqual({ type: "phase-done", phase: "claims", index: 5, total: 5, findings: 0 });
    expect(events).toContainEqual({ type: "judge-done", accepted: 0, candidates: 0 });
  }, 30_000);
});
