import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunStore, writeRunReport } from "../src/runs/runStore.js";

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
