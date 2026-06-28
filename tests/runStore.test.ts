import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunStore, writeFindingArtifacts, writeJsonArtifact, writeRunReport } from "../src/runs/runStore.js";
import { Finding } from "../src/contracts/findings.js";

describe("run store", () => {
  it("writes findings.json and report.md under .possum/runs/<id>", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-run-store-"));
    const store = createRunStore(root);

    const written = await writeRunReport(store, {
      runId: "run_20260613_120000",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-13T02:00:00.000Z",
      completedAt: "2026-06-13T02:01:00.000Z",
      personas: ["beginner"],
      findings: []
    });

    expect(written.runDir.endsWith(".possum/runs/run_20260613_120000")).toBe(true);
    await expect(readFile(join(written.runDir, "findings.json"), "utf8")).resolves.toContain(
      "\"runId\": \"run_20260613_120000\""
    );
    await expect(readFile(join(written.runDir, "report.md"), "utf8")).resolves.toContain(
      "# Possum Audit run_20260613_120000"
    );
  });
});

describe("writeFindingArtifacts", () => {
  it("writes debugging bundle artifacts for a finding", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-finding-artifacts-"));
    const store = createRunStore(root);
    const finding: Finding = {
      id: "finding_impatient_double_submit_001",
      runId: "run_1",
      persona: "impatient",
      severity: "high",
      confidence: "confirmed",
      mission: "Submit the form quickly.",
      claim: "The form should only submit once.",
      expected: "Rapid clicks should submit once.",
      actual: "The form submitted twice.",
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: [],
        trace: "findings/finding_impatient_double_submit_001/trace.json",
        repro: "findings/finding_impatient_double_submit_001/repro.spec.ts"
      },
      dedupeFingerprint: "impatient:double-submit"
    };

    await writeFindingArtifacts(store, "run_1", finding, {
      trace: { actions: [{ type: "click", target: "Submit" }] },
      reproSpec: "import { test } from '@playwright/test';\n"
    });

    const findingDir = join(root, ".possum", "runs", "run_1", "findings", "finding_impatient_double_submit_001");
    const debug = JSON.parse(await readFile(join(findingDir, "debug.json"), "utf8"));
    expect(debug).toMatchObject({
      findingId: "finding_impatient_double_submit_001",
      timeline: [{ type: "click", target: "Submit" }],
      repairHints: [expect.stringContaining("duplicate-submit guards"), expect.any(String)]
    });
    await expect(readFile(join(findingDir, "repair-hints.md"), "utf8")).resolves.toContain(
      "# Repair hints for finding_impatient_double_submit_001"
    );
    await expect(readFile(join(findingDir, "report.md"), "utf8")).resolves.toContain("## Debugging Bundle");
  });
});

describe("writeJsonArtifact", () => {
  it("writes arbitrary run JSON under the run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-run-artifact-"));
    const store = createRunStore(root);

    const path = await writeJsonArtifact(store, "run_1", "verification.json", {
      runType: "feature_verification",
      checks: [{ id: "check_1", verdict: "passed" }]
    });

    expect(path).toBe(join(root, ".possum", "runs", "run_1", "verification.json"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      runType: "feature_verification",
      checks: [{ id: "check_1", verdict: "passed" }]
    });
  });
});
