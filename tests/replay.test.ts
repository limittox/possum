import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReplayCommand, runReplay } from "../src/replay/replayCommand.js";

describe("buildReplayCommand", () => {
  it("builds an npx playwright command for a repro path", () => {
    expect(buildReplayCommand("/repo", "findings/example/repro.spec.ts")).toEqual({
      command: "npx",
      args: ["playwright", "test", join("/repo", "findings/example/repro.spec.ts")]
    });
  });

  it("uses the run-local Playwright config for .possum repros", () => {
    expect(buildReplayCommand("/repo", ".possum/runs/run_1/findings/example/repro.spec.ts")).toEqual({
      command: "npx",
      args: [
        "playwright",
        "test",
        "--config",
        join("/repo", ".possum/runs/run_1/playwright.config.ts"),
        join("/repo", ".possum/runs/run_1/findings/example/repro.spec.ts")
      ]
    });
  });
});

describe("runReplay", () => {
  it("executes the generated Playwright command", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await runReplay({
      rootDir: "/repo",
      reproPath: "findings/example/repro.spec.ts",
      execFile: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "passed", stderr: "", exitCode: 0 };
      }
    });

    expect(calls).toEqual([
      {
        command: "npx",
        args: ["playwright", "test", join("/repo", "findings/example/repro.spec.ts")]
      }
    ]);
    expect(result.stdout).toBe("passed");
  });

  it("returns stdout and stderr when Playwright exits non-zero", async () => {
    const result = await runReplay({
      rootDir: "/repo",
      reproPath: "findings/example/repro.spec.ts",
      execFile: async () => ({ stdout: "browser missing", stderr: "install deps", exitCode: 1 })
    });

    expect(result).toEqual({ stdout: "browser missing", stderr: "install deps", exitCode: 1 });
  });
});
