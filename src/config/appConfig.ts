import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ZodError } from "zod";
import { PossumConfig, PossumConfigSchema } from "../contracts/config.js";

export type ResolvedModelsConfig = PossumConfig["models"];

export const POSSUM_CONFIG_FILENAME = "possum.config.json";
export const POSSUM_RUNS_GITIGNORE_ENTRY = ".possum/runs/";

export interface AuditTargetInput {
  rootDir: string;
  targetUrl?: string;
  runCommand?: string;
}

export interface ResolvedAuditTarget {
  targetUrl: string;
  runCommand?: string;
  models?: ResolvedModelsConfig;
  maxStepsPerPersona?: number;
  maxMinutesPerPersona?: number;
  requestTimeoutSeconds?: number;
}

export function createStarterPossumConfig(): Pick<PossumConfig, "target"> {
  return {
    target: {
      url: "http://localhost:3000",
      command: "npm run dev"
    }
  };
}

export async function writeStarterPossumConfig(rootDir: string): Promise<string> {
  const configPath = getPossumConfigPath(rootDir);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(createStarterPossumConfig(), null, 2)}\n`, { flag: "wx" });
  return configPath;
}

export async function ensurePossumRunArtifactsIgnored(rootDir: string): Promise<string> {
  const gitignorePath = join(rootDir, ".gitignore");
  let current = "";

  try {
    current = await readFile(gitignorePath, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (isPossumRunsIgnored(current)) {
    return gitignorePath;
  }

  const separator = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(gitignorePath, `${current}${separator}${POSSUM_RUNS_GITIGNORE_ENTRY}\n`, "utf8");
  return gitignorePath;
}

export async function readPossumConfig(rootDir: string): Promise<PossumConfig | undefined> {
  const configPath = getPossumConfigPath(rootDir);
  let raw: string;

  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${POSSUM_CONFIG_FILENAME}: ${message}`);
  }

  try {
    return PossumConfigSchema.parse(parsedJson);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Invalid ${POSSUM_CONFIG_FILENAME}: ${error.issues.map(formatZodIssue).join("; ")}`);
    }
    throw error;
  }
}

export async function resolveAuditTarget(input: AuditTargetInput): Promise<ResolvedAuditTarget> {
  const config = await readPossumConfig(input.rootDir);
  const targetUrl = input.targetUrl ?? config?.target.url;
  const runCommand = input.runCommand ?? config?.target.command;

  if (!targetUrl) {
    throw new Error(
      `Missing audit target URL. Pass --url <url> or run possum init and set target.url in ${POSSUM_CONFIG_FILENAME}.`
    );
  }

  return {
    targetUrl,
    runCommand,
    models: config?.models,
    maxStepsPerPersona: config?.budgets?.maxStepsPerPersona,
    maxMinutesPerPersona: config?.budgets?.maxMinutesPerPersona,
    requestTimeoutSeconds: config?.budgets?.requestTimeoutSeconds
  };
}

export function getPossumConfigPath(rootDir: string): string {
  return join(rootDir, POSSUM_CONFIG_FILENAME);
}

function isPossumRunsIgnored(gitignore: string): boolean {
  return gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === POSSUM_RUNS_GITIGNORE_ENTRY || line === `/${POSSUM_RUNS_GITIGNORE_ENTRY}` || line === ".possum/" || line === "/.possum/");
}

function formatZodIssue(issue: ZodError["issues"][number]): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "config";
  return `${path}: ${issue.message}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
