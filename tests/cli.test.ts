import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

    await program.parseAsync(["node", "possum", "audit", "--url", "http://127.0.0.1:65534"]);

    // Progress lines go to stderr only.
    expect(stderr.join("\n")).toContain("possum: [1/4] beginner");
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

    await program.parseAsync(["node", "possum", "verify-app", "--url", "http://127.0.0.1:65534"]);

    expect(output.join("\n")).toContain("Possum app verification created run_20260628_020000");
    expect(output.join("\n")).toContain("Report:");
    expect(output.join("\n")).toContain("HTML Report:");
  });

  it("records a default auth session and updates possum.config.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-auth-record-"));
    await writeFile(
      join(root, "possum.config.json"),
      JSON.stringify({ target: { url: "http://localhost:3000", command: "npm run dev" } }, null, 2),
      "utf8"
    );
    const output: string[] = [];
    const calls: Array<{ rootDir: string; targetUrl: string; runCommand?: string; name?: string }> = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      recordAuthSessionImpl: async (input) => {
        calls.push(input);
        return { profileName: input.name ?? "default", storageStatePath: join(root, ".possum/auth/default.json") };
      }
    });

    await program.parseAsync(["node", "possum", "auth", "record"]);

    expect(calls).toMatchObject([
      { rootDir: root, targetUrl: "http://localhost:3000", runCommand: "npm run dev", name: "default" }
    ]);
    const config = JSON.parse(await readFile(join(root, "possum.config.json"), "utf8"));
    expect(config.auth).toEqual({ storageState: ".possum/auth/default.json" });
    expect(output.join("\n")).toContain("Auth session recorded: default");
  });

  it("passes named auth profile storage state to verify-app", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-app-auth-"));
    const output: string[] = [];
    let storageState: string | undefined;
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      verifyAppImpl: async (input) => {
        storageState = input.storageState;
        return {
          runId: "run_auth",
          runDir: join(root, ".possum", "runs", "run_auth"),
          reportMarkdownPath: join(root, ".possum", "runs", "run_auth", "report.md"),
          reportHtmlPath: join(root, ".possum", "runs", "run_auth", "report.html"),
          findingsJsonPath: join(root, ".possum", "runs", "run_auth", "findings.json")
        };
      }
    });

    await program.parseAsync(["node", "possum", "verify-app", "--url", "http://localhost:3000", "--auth", "admin"]);

    expect(storageState).toBe(join(root, ".possum/auth/admin.json"));
  });

  it("passes configured auth storage state to verify-feature", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-feature-auth-"));
    await writeFile(
      join(root, "possum.config.json"),
      JSON.stringify({
        target: { url: "http://localhost:3000" },
        auth: { storageState: ".possum/auth/default.json" }
      }),
      "utf8"
    );
    const briefPath = join(root, "feature.json");
    await writeFile(briefPath, JSON.stringify({ feature: "Auth-only dashboard", checks: [{ text: "Dashboard loads" }] }), "utf8");
    const output: string[] = [];
    let storageState: string | undefined;
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      resolveFeatureVerification: () => ({
        llm: { async complete() { return { text: "{}" }; } },
        model: "agent-model",
        maxSteps: 5,
        budgetMs: 60_000
      }),
      verifyFeatureImpl: async (input) => {
        storageState = input.storageState;
        return {
          runId: "run_auth_feature",
          runDir: join(root, ".possum", "runs", "run_auth_feature"),
          reportMarkdownPath: join(root, ".possum", "runs", "run_auth_feature", "report.md"),
          reportHtmlPath: join(root, ".possum", "runs", "run_auth_feature", "report.html"),
          findingsJsonPath: join(root, ".possum", "runs", "run_auth_feature", "findings.json"),
          verificationJsonPath: join(root, ".possum", "runs", "run_auth_feature", "verification.json")
        };
      }
    });

    await program.parseAsync(["node", "possum", "verify-feature", "--brief", briefPath]);

    expect(storageState).toBe(join(root, ".possum/auth/default.json"));
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
        reportHtmlPath: join(root, ".possum", "runs", "run_20260628_020000", "report.html"),
        findingsJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "findings.json"),
        verificationJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "verification.json")
      })
    });

    await program.parseAsync(["node", "possum", "verify-feature", "--url", "http://localhost:3000", "--brief", briefPath]);

    expect(output).toEqual([
      "Possum feature verification created run_20260628_020000",
      `Report: ${join(root, ".possum", "runs", "run_20260628_020000", "report.md")}`,
      `HTML Report: ${join(root, ".possum", "runs", "run_20260628_020000", "report.html")}`,
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
          reportHtmlPath: join(root, ".possum", "runs", "run_20260628_020000", "report.html"),
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
      `HTML Report: ${join(root, ".possum", "runs", "run_20260628_020000", "report.html")}`,
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
        reportHtmlPath: join(root, ".possum", "runs", "run_20260628_020000", "report.html"),
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

  it("installs Claude Code pack globally by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-root-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code"]);

    const skillPath = join(home, ".claude", "skills", "possum-verify", "SKILL.md");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("possum verify-diff");
    expect(output).toEqual([
      "Installed global Claude Code Possum verification skill:",
      "- ~/.claude/skills/possum-verify/SKILL.md",
      "",
      "Next steps:",
      "- Restart Claude Code if ~/.claude/skills did not exist when the session started.",
      "- Ask Claude Code to use /possum-verify after customer-facing changes."
    ]);
  });

  it("installs Claude Code pack into project when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-project-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code", "--project"]);

    const skillPath = join(root, ".claude", "skills", "possum-verify", "SKILL.md");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("possum verify-app");
    expect(output).toEqual([
      "Installed project Claude Code Possum verification skill:",
      "- .claude/skills/possum-verify/SKILL.md"
    ]);
  });

  it("does not overwrite existing Claude Code pack without force", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-skip-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const skillPath = join(home, ".claude", "skills", "possum-verify", "SKILL.md");
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, "custom skill", "utf8");
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code"]);

    await expect(readFile(skillPath, "utf8")).resolves.toBe("custom skill");
    expect(output).toEqual([
      "Skipped existing Claude Code skill with different content:",
      "- ~/.claude/skills/possum-verify/SKILL.md",
      "",
      "Re-run with --force to overwrite."
    ]);
  });

  it("overwrites existing Claude Code pack with force", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-force-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const skillPath = join(root, ".claude", "skills", "possum-verify", "SKILL.md");
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, "custom project skill", "utf8");
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code", "--project", "--force"]);

    await expect(readFile(skillPath, "utf8")).resolves.toContain("possum verify-feature --brief");
    expect(output).toEqual([
      "Overwrote project Claude Code Possum verification skill:",
      "- .claude/skills/possum-verify/SKILL.md"
    ]);
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
