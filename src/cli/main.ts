#!/usr/bin/env node
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../audit/audit.js";
import {
  getAuthStorageStatePath,
  recordAuthSession,
  RecordAuthSessionInput,
  RecordAuthSessionResult,
  updateDefaultAuthConfig
} from "../auth/sessionRecorder.js";
import {
  ensurePossumRunArtifactsIgnored,
  POSSUM_CONFIG_FILENAME,
  ResolvedAuditTarget,
  resolveAuditTarget,
  writeStarterPossumConfig
} from "../config/appConfig.js";
import { checkPlaywrightSystemDependencies, renderDoctorReport } from "../doctor/doctor.js";
import { collectGitDiff } from "../diff/gitDiff.js";
import { startPossumMcpServer } from "../mcp/server.js";
import { ReplayExecFile, runReplay } from "../replay/replayCommand.js";
import { LlmClient } from "../llm/client.js";
import { resolveClaimVerification } from "../llm/resolveLlmClient.js";
import { verifyApp } from "../verification/appVerification.js";
import { inferFeatureBriefFromDiff } from "../verification/diffInference.js";
import {
  FeatureVerificationResult,
  runFeatureVerification,
  RunFeatureVerificationInput
} from "../verification/featureVerification.js";
import { FeatureVerificationBrief, FeatureVerificationBriefSchema } from "../verification/types.js";
import { formatProgressEvent } from "./auditProgress.js";

interface ResolvedFeatureVerificationCliConfig {
  llm: LlmClient;
  model: string;
  maxSteps: number;
  budgetMs: number;
}

type VerifyFeatureImpl = (input: RunFeatureVerificationInput) => Promise<FeatureVerificationResult>;
type InferFeatureBriefFromDiffImpl = typeof inferFeatureBriefFromDiff;
type CollectGitDiffImpl = typeof collectGitDiff;
type RecordAuthSessionImpl = (input: RecordAuthSessionInput) => Promise<RecordAuthSessionResult>;

export interface CliDependencies {
  cwd: string;
  stdout: (line: string) => void;
  stderr?: (line: string) => void;
  execFile?: ReplayExecFile;
  now?: Date;
  setExitCode?: (code: number) => void;
  runAuditImpl?: typeof runAudit;
  verifyAppImpl?: typeof verifyApp;
  verifyFeatureImpl?: VerifyFeatureImpl;
  recordAuthSessionImpl?: RecordAuthSessionImpl;
  collectGitDiffImpl?: CollectGitDiffImpl;
  inferFeatureBriefFromDiffImpl?: InferFeatureBriefFromDiffImpl;
  resolveFeatureVerification?: (target: ResolvedAuditTarget) => ResolvedFeatureVerificationCliConfig;
}

export function buildProgram(deps: CliDependencies): Command {
  const program = new Command();

  program.name("possum").description("Local customer simulator for AI-built apps.");

  program
    .command("doctor")
    .description("Check local dependencies needed by Possum.")
    .action(async () => {
      const report = await checkPlaywrightSystemDependencies({ execFile: deps.execFile });
      deps.stdout(renderDoctorReport(report));
    });

  program
    .command("init")
    .description("Create a starter possum.config.json for this app.")
    .action(async () => {
      const configPath = await writeStarterPossumConfig(deps.cwd);
      const gitignorePath = await ensurePossumRunArtifactsIgnored(deps.cwd);
      deps.stdout(`Created ${POSSUM_CONFIG_FILENAME}`);
      deps.stdout(`Config: ${configPath}`);
      deps.stdout(`Gitignore: ${gitignorePath}`);
    });

  const authCommand = program.command("auth").description("Manage browser auth sessions.");

  authCommand
    .command("record")
    .description("Record a manual login session as Playwright storage state.")
    .option("--name <name>", "Auth profile name to save", "default")
    .option("--url <url>", "Local app URL to open for login")
    .option("--command <command>", "Sandboxed command to start the local app before recording")
    .action(async (options: { command?: string; name: string; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      await ensurePossumRunArtifactsIgnored(deps.cwd);
      const result = await (deps.recordAuthSessionImpl ?? recordAuthSession)({
        rootDir: deps.cwd,
        targetUrl: target.targetUrl,
        runCommand: target.runCommand,
        name: options.name,
        stdout: deps.stdout
      });

      if (result.profileName === "default") {
        const updatedConfig = await updateDefaultAuthConfig(deps.cwd, result.storageStatePath);
        if (updatedConfig) {
          deps.stdout(`Updated ${POSSUM_CONFIG_FILENAME} auth.storageState`);
        }
      }

      deps.stdout(`Auth session recorded: ${result.profileName}`);
      deps.stdout(`Storage state: ${result.storageStatePath}`);
    });

  program
    .command("verify-feature")
    .description("Verify a completed feature from a JSON brief.")
    .requiredOption("--brief <path>", "Path to feature verification brief JSON")
    .option("--url <url>", "Local app URL to verify")
    .option("--command <command>", "Sandboxed command to start the local app before verifying")
    .option("--auth <auth>", "Auth profile name or Playwright storage state path")
    .action(async (options: { auth?: string; brief: string; command?: string; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      const rawBrief = JSON.parse(await readFile(options.brief, "utf8"));
      const brief = FeatureVerificationBriefSchema.parse(rawBrief);
      const resolved = (deps.resolveFeatureVerification ?? resolveFeatureVerificationFromTarget)(target);
      const storageState = resolveAuthStorageState(deps.cwd, target, options.auth);
      const emitProgress = deps.stderr;
      const result = await (deps.verifyFeatureImpl ?? runFeatureVerification)({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        brief,
        llm: resolved.llm,
        model: resolved.model,
        maxSteps: resolved.maxSteps,
        budgetMs: resolved.budgetMs,
        now: deps.now,
        storageState,
        onProgress: emitProgress ? (event) => emitProgress(formatProgressEvent(event)) : undefined
      });

      deps.stdout(`Possum feature verification created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
      deps.stdout(`HTML Report: ${result.reportHtmlPath}`);
      deps.stdout(`Verification: ${result.verificationJsonPath}`);
    });

  program
    .command("verify-diff")
    .description("Infer a feature brief from git diff and verify it in the browser.")
    .option("--base <base>", "Base ref to compare against instead of auto-detecting a diff")
    .option("--url <url>", "Local app URL to verify")
    .option("--command <command>", "Sandboxed command to start the local app before verifying")
    .option("--auth <auth>", "Auth profile name or Playwright storage state path")
    .option("--brief-out <path>", "Write the generated feature brief to this path")
    .option("--no-run", "Only generate the feature brief; do not run browser verification")
    .action(async (options: { auth?: string; base?: string; briefOut?: string; command?: string; run?: boolean; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      const resolved = (deps.resolveFeatureVerification ?? ((resolvedTarget) =>
        resolveFeatureVerificationFromTarget(resolvedTarget, "Diff verification requires models in possum.config.json.")))(target);
      const diff = await (deps.collectGitDiffImpl ?? collectGitDiff)({ rootDir: deps.cwd, base: options.base });
      const brief = await (deps.inferFeatureBriefFromDiffImpl ?? inferFeatureBriefFromDiff)({
        diff,
        llm: resolved.llm,
        model: resolved.model
      });
      const storageState = resolveAuthStorageState(deps.cwd, target, options.auth);
      const briefOut = options.briefOut ? resolve(deps.cwd, options.briefOut) : undefined;
      if (briefOut) {
        await writeFeatureBrief(briefOut, brief);
      }

      if (options.run === false) {
        const generatedPath = briefOut ?? join(deps.cwd, ".possum", "diff-brief.json");
        if (!briefOut) {
          await writeFeatureBrief(generatedPath, brief);
        }
        deps.stdout(`Generated feature brief: ${generatedPath}`);
        return;
      }

      const emitProgress = deps.stderr;
      const result = await (deps.verifyFeatureImpl ?? runFeatureVerification)({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        brief,
        llm: resolved.llm,
        model: resolved.model,
        maxSteps: resolved.maxSteps,
        budgetMs: resolved.budgetMs,
        now: deps.now,
        storageState,
        onProgress: emitProgress ? (event) => emitProgress(formatProgressEvent(event)) : undefined
      });
      const runBriefPath = join(result.runDir, "diff-brief.json");
      await writeFeatureBrief(runBriefPath, brief);

      deps.stdout(`Possum diff verification created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
      deps.stdout(`HTML Report: ${result.reportHtmlPath}`);
      deps.stdout(`Verification: ${result.verificationJsonPath}`);
      deps.stdout(`Generated brief: ${briefOut ?? runBriefPath}`);
    });

  program
    .command("verify-app")
    .description("Verify app behavior using Possum's app verification workflow.")
    .option("--url <url>", "Local app URL to verify")
    .option("--command <command>", "Sandboxed command to start the local app before verifying")
    .option("--auth <auth>", "Auth profile name or Playwright storage state path")
    .action(async (options: { auth?: string; command?: string; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      const storageState = resolveAuthStorageState(deps.cwd, target, options.auth);
      const emitProgress = deps.stderr;
      const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
      const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
      const result = await (deps.verifyAppImpl ?? verifyApp)({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        now: deps.now,
        storageState,
        claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
          requestTimeoutMs,
          budgetMs
        }),
        onProgress: emitProgress ? (event) => emitProgress(formatProgressEvent(event)) : undefined
      });

      deps.stdout(`Possum app verification created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
      deps.stdout(`HTML Report: ${result.reportHtmlPath}`);
      if (result.surfaceJsonPath) {
        deps.stdout(`Surface: ${result.surfaceJsonPath}`);
      }
    });

  program
    .command("audit")
    .description("Run local customer audit.")
    .option("--url <url>", "Local app URL audit")
    .option("--command <command>", "Sandboxed command start local app before auditing")
    .option("--auth <auth>", "Auth profile name or Playwright storage state path")
    .action(async (options: { auth?: string; command?: string; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      const storageState = resolveAuthStorageState(deps.cwd, target, options.auth);
      const emitProgress = deps.stderr;
      const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
      const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
      const result = await (deps.runAuditImpl ?? runAudit)({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        now: deps.now,
        storageState,
        claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
          requestTimeoutMs,
          budgetMs
        }),
        onProgress: emitProgress ? (event) => emitProgress(formatProgressEvent(event)) : undefined
      });

      deps.stdout(`Possum audit created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
      deps.stdout(`HTML Report: ${result.reportHtmlPath}`);
      if (result.surfaceJsonPath) {
        deps.stdout(`Surface: ${result.surfaceJsonPath}`);
      }
    });

  program
    .command("report")
    .description("Print local run report.")
    .argument("<runId>", "Run id under .possum/runs")
    .action(async (runId: string) => {
      const reportPath = join(deps.cwd, ".possum", "runs", runId, "report.md");
      deps.stdout(await readFile(reportPath, "utf8"));
    });

  program
    .command("replay")
    .description("Run Playwright repro for finding.")
    .argument("<reproPath>", "Path generated repro.spec.ts")
    .action(async (reproPath: string) => {
      const result = await runReplay({ rootDir: deps.cwd, reproPath, execFile: deps.execFile });
      if (result.stdout) {
        deps.stdout(result.stdout.trimEnd());
      }
      if (result.stderr) {
        deps.stdout(result.stderr.trimEnd());
      }
      if (result.exitCode !== 0) {
        (deps.setExitCode ?? ((code: number) => (process.exitCode = code)))(result.exitCode);
      }
    });

  program.command("mcp").description("Start Possum MCP server over stdio.").action(async () => {
    await startPossumMcpServer({ rootDir: deps.cwd });
  });

  return program;
}

async function writeFeatureBrief(path: string, brief: FeatureVerificationBrief): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
}

function resolveAuthStorageState(
  rootDir: string,
  target: ResolvedAuditTarget,
  authOption: string | undefined
): string | undefined {
  if (!authOption) {
    return target.authStorageState;
  }

  if (isAuthStorageStatePath(authOption)) {
    return isAbsolute(authOption) ? authOption : resolve(rootDir, authOption);
  }

  return getAuthStorageStatePath(rootDir, authOption);
}

function isAuthStorageStatePath(value: string): boolean {
  return isAbsolute(value) || value.startsWith(".") || value.includes("/") || value.includes("\\") || value.endsWith(".json");
}

function resolveFeatureVerificationFromTarget(
  target: ResolvedAuditTarget,
  missingModelsMessage = "Feature verification requires models in possum.config.json."
): ResolvedFeatureVerificationCliConfig {
  const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
  const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
  const resolved = resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
    requestTimeoutMs,
    budgetMs
  });

  if (!resolved) {
    throw new Error(missingModelsMessage);
  }

  return {
    llm: resolved.llm,
    model: resolved.models.personaModel,
    maxSteps: resolved.maxSteps,
    budgetMs: resolved.budgetMs
  };
}

export function isCliEntrypoint(importMetaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) {
    return false;
  }

  return realpathSync(argvPath) === realpathSync(fileURLToPath(importMetaUrl));
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  await buildProgram({
    cwd: process.cwd(),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line)
  }).parseAsync(process.argv);
}
