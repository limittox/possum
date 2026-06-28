import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyApp } from "../src/verification/appVerification.js";

describe("verifyApp", () => {
  it("wraps current audit behavior and marks run as app_verification", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-verify-app-"));

    const result = await verifyApp({
      rootDir,
      targetUrl: "http://127.0.0.1:9",
      now: new Date("2026-06-28T02:00:00.000Z")
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const markdown = await readFile(result.reportMarkdownPath, "utf8");

    expect(report.runType).toBe("app_verification");
    expect(markdown).toContain("# Possum App Verification run_20260628_020000");
  });
});
