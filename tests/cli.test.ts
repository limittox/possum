import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli/main.js";

describe("CLI", () => {
  it("runs audit and prints the run id", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-"));
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    await program.parseAsync(["node", "possum", "audit", "--url", "http://localhost:3000"]);

    expect(output.join("\n")).toContain("run_20260613_020000");
  });

  it("runs replay through the configured command runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-replay-"));
    const output: string[] = [];
    const calls: Array<{ command: string; args: string[] }> = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      execFile: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "1 passed", stderr: "", exitCode: 0 };
      }
    });

    await program.parseAsync(["node", "possum", "replay", "findings/example/repro.spec.ts"]);

    expect(calls).toEqual([
      {
        command: "npx",
        args: ["playwright", "test", join(root, "findings/example/repro.spec.ts")]
      }
    ]);
    expect(output.join("\n")).toContain("1 passed");
  });

  it("prints replay failure output without throwing a Node stack trace", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-replay-failure-"));
    const output: string[] = [];
    const exitCodes: number[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      setExitCode: (code) => exitCodes.push(code),
      execFile: async () => ({ stdout: "browser missing", stderr: "install deps", exitCode: 1 })
    });

    await program.parseAsync(["node", "possum", "replay", "findings/example/repro.spec.ts"]);

    expect(output.join("\n")).toContain("browser missing");
    expect(output.join("\n")).toContain("install deps");
    expect(exitCodes).toEqual([1]);
  });

  it("prints doctor guidance for missing Playwright system dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-doctor-"));
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      execFile: async () => ({ stdout: "", stderr: "", exitCode: 0 })
    });

    await program.parseAsync(["node", "possum", "doctor"]);

    expect(output.join("\n")).toContain("libasound.so.2");
    expect(output.join("\n")).toContain('sudo env "PATH=$PATH" npx playwright install-deps chromium');
  });
});
