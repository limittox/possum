import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAuditStub } from "../src/audit/auditStub.js";

describe("runAuditStub", () => {
  it("creates a valid local run with no findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-audit-"));

    const result = await runAuditStub({
      rootDir: root,
      targetUrl: "http://localhost:3000",
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    expect(result.runId).toBe("run_20260613_020000");
    const json = await readFile(join(root, ".possum", "runs", result.runId, "findings.json"), "utf8");
    expect(json).toContain("\"targetUrl\": \"http://localhost:3000\"");
  });
});
