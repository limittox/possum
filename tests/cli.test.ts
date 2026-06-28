import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram, isCliEntrypoint } from "../src/cli/main.js";

describe("CLI", () => {
  it("detects linked bin entrypoints that resolve through a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-entrypoint-"));
    const realEntrypoint = join(root, "main.js");
    const linkedEntrypoint = join(root, "possum");

    await writeFile(realEntrypoint, "", "utf8");
    await symlink(realEntrypoint, linkedEntrypoint);

    expect(isCliEntrypoint(`file://${realEntrypoint}`, linkedEntrypoint)).toBe(true);
  });

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

  it("writes audit progress to stderr and results to stdout", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-progress-"));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    await program.parseAsync(["node", "possum", "audit", "--url", "http://127.0.0.1:9"]);

    // Progress lines go to stderr only.
    expect(stderr.join("\n")).toContain("possum: [1/3] beginner");
    expect(stderr.join("\n")).toContain("possum: judge —");
    // Result lines go to stdout only.
    expect(stdout.join("\n")).toContain("run_20260613_020000");
    expect(stdout.join("\n")).not.toContain("possum: [1/3]");
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

  it("runs verify-app and prints app verification result paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-app-"));
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      now: new Date("2026-06-28T02:00:00.000Z")
    });

    await program.parseAsync(["node", "possum", "verify-app", "--url", "http://127.0.0.1:9"]);

    expect(output.join("\n")).toContain("Possum app verification created run_20260628_020000");
    expect(output.join("\n")).toContain("Report:");
  });

  it("runs verify-feature from a brief file using injected dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-feature-"));
    const briefPath = join(root, "feature.json");
    await writeFile(
      briefPath,
      JSON.stringify({ feature: "Added CSV export", checks: [{ text: "Export CSV button is visible" }] }),
      "utf8"
    );
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      now: new Date("2026-06-28T02:00:00.000Z"),
      resolveFeatureVerification: () => ({
        llm: {
          async complete() {
            return { text: "{}" };
          }
        },
        model: "agent-model",
        maxSteps: 5,
        budgetMs: 60_000
      }),
      verifyFeatureImpl: async () => ({
        runId: "run_20260628_020000",
        runDir: join(root, ".possum", "runs", "run_20260628_020000"),
        reportMarkdownPath: join(root, ".possum", "runs", "run_20260628_020000", "report.md"),
        findingsJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "findings.json"),
        verificationJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "verification.json")
      })
    });

    await program.parseAsync(["node", "possum", "verify-feature", "--url", "http://localhost:3000", "--brief", briefPath]);

    expect(output).toEqual([
      "Possum feature verification created run_20260628_020000",
      `Report: ${join(root, ".possum", "runs", "run_20260628_020000", "report.md")}`,
      `Verification: ${join(root, ".possum", "runs", "run_20260628_020000", "verification.json")}`
    ]);
  });

  it("runs verify-diff by inferring and verifying a generated feature brief", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-diff-"));
    const output: string[] = [];
    const generatedBrief = {
      feature: "Homepage adds a Get the app CTA",
      pages: ["/"],
      setup: [],
      checks: [{ text: "The homepage shows Get the app", hints: { expectedText: "Get the app" } }]
    };
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      now: new Date("2026-06-28T02:00:00.000Z"),
      resolveFeatureVerification: () => ({
        llm: {
          async complete() {
            return { text: "{}" };
          }
        },
        model: "agent-model",
        maxSteps: 5,
        budgetMs: 60_000
      }),
      collectGitDiffImpl: async () => ({
        source: "working-tree",
        diff: "diff body",
        changedFiles: ["app/page.tsx"]
      }),
      inferFeatureBriefFromDiffImpl: async () => generatedBrief,
      verifyFeatureImpl: async (input) => {
        expect(input.brief).toEqual(generatedBrief);
        return {
          runId: "run_20260628_020000",
          runDir: join(root, ".possum", "runs", "run_20260628_020000"),
          reportMarkdownPath: join(root, ".possum", "runs", "run_20260628_020000", "report.md"),
          findingsJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "findings.json"),
          verificationJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "verification.json")
        };
      }
    });

    await program.parseAsync(["node", "possum", "verify-diff", "--url", "http://localhost:3000"]);

    const generatedPath = join(root, ".possum", "runs", "run_20260628_020000", "diff-brief.json");
    await expect(readFile(generatedPath, "utf8")).resolves.toContain("Homepage adds a Get the app CTA");
    expect(output).toEqual([
      "Possum diff verification created run_20260628_020000",
      `Report: ${join(root, ".possum", "runs", "run_20260628_020000", "report.md")}`,
      `Verification: ${join(root, ".possum", "runs", "run_20260628_020000", "verification.json")}`,
      `Generated brief: ${generatedPath}`
    ]);
  });

  it("writes verify-diff generated brief to --brief-out", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-diff-brief-out-"));
    const briefOut = join(root, "feature.generated.json");
    const output: string[] = [];
    const generatedBrief = {
      feature: "Updated pricing CTA",
      pages: ["/pricing"],
      setup: [],
      checks: [{ text: "Pricing page shows updated CTA" }]
    };
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      resolveFeatureVerification: () => ({
        llm: { async complete() { return { text: "{}" }; } },
        model: "agent-model",
        maxSteps: 5,
        budgetMs: 60_000
      }),
      collectGitDiffImpl: async () => ({ source: "base", base: "main", diff: "diff body", changedFiles: ["app/pricing/page.tsx"] }),
      inferFeatureBriefFromDiffImpl: async () => generatedBrief,
      verifyFeatureImpl: async () => ({
        runId: "run_20260628_020000",
        runDir: join(root, ".possum", "runs", "run_20260628_020000"),
        reportMarkdownPath: join(root, ".possum", "runs", "run_20260628_020000", "report.md"),
        findingsJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "findings.json"),
        verificationJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "verification.json")
      })
    });

    await program.parseAsync(["node", "possum", "verify-diff", "--url", "http://localhost:3000", "--brief-out", briefOut]);

    await expect(readFile(briefOut, "utf8")).resolves.toContain("Updated pricing CTA");
  });

  it("supports verify-diff --no-run", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-diff-no-run-"));
    const briefOut = join(root, "feature.generated.json");
    const output: string[] = [];
    let verifyCalled = false;
    const generatedBrief = {
      feature: "Added FAQ section",
      pages: ["/"],
      setup: [],
      checks: [{ text: "Homepage shows FAQ section" }]
    };
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      resolveFeatureVerification: () => ({
        llm: { async complete() { return { text: "{}" }; } },
        model: "agent-model",
        maxSteps: 5,
        budgetMs: 60_000
      }),
      collectGitDiffImpl: async () => ({ source: "working-tree", diff: "diff body", changedFiles: ["app/page.tsx"] }),
      inferFeatureBriefFromDiffImpl: async () => generatedBrief,
      verifyFeatureImpl: async () => {
        verifyCalled = true;
        throw new Error("verify should not run");
      }
    });

    await program.parseAsync([
      "node",
      "possum",
      "verify-diff",
      "--url",
      "http://localhost:3000",
      "--brief-out",
      briefOut,
      "--no-run"
    ]);

    expect(verifyCalled).toBe(false);
    await expect(readFile(briefOut, "utf8")).resolves.toContain("Added FAQ section");
    expect(output).toEqual([`Generated feature brief: ${briefOut}`]);
  });

  it("requires models for verify-diff", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-diff-models-"));
    const output: string[] = [];
    const program = buildProgram({ cwd: root, stdout: (line) => output.push(line) });

    await expect(program.parseAsync(["node", "possum", "verify-diff", "--url", "http://localhost:3000"])).rejects.toThrow(
      "Diff verification requires models in possum.config.json."
    );
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
