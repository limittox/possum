import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunStore, writeJsonArtifact, writeRunReport } from "../src/runs/runStore.js";

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
