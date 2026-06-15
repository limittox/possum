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
        attempts: 2
      }
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const claimFinding = report.findings.find(
      (finding: { id: string }) => finding.id === "finding_claim_unfulfilled_001"
    );

    expect(claimFinding).toBeDefined();
    expect(claimFinding.persona).toBe("claims");
    expect(claimFinding.reproducibility).toEqual({ status: "reproduced", attempts: 2 });
  }, 30_000);

  it("does not run claim verification when models are absent", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-off-"));

    const result = await runAudit({ rootDir, targetUrl: baseUrl });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const claimFindings = report.findings.filter((finding: { persona: string }) => finding.persona === "claims");
    expect(claimFindings).toHaveLength(0);
  }, 30_000);
});
