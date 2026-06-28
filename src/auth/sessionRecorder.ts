import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout as processStdout } from "node:process";
import { chromium } from "playwright";
import { getPossumConfigPath } from "../config/appConfig.js";
import { ManagedRunCommand, startRunCommand } from "../audit/runCommand.js";

export interface AuthSessionPage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
}

export interface AuthSessionBrowserContext {
  newPage(): Promise<AuthSessionPage>;
  storageState(options: { path: string }): Promise<unknown>;
}

export interface AuthSessionBrowser {
  newContext(): Promise<AuthSessionBrowserContext>;
  close(): Promise<void>;
}

export interface RecordAuthSessionInput {
  rootDir: string;
  targetUrl: string;
  runCommand?: string;
  name?: string;
  launchBrowser?: () => Promise<AuthSessionBrowser>;
  waitForCompletion?: () => Promise<void>;
  stdout?: (line: string) => void;
}

export interface RecordAuthSessionResult {
  storageStatePath: string;
  profileName: string;
}

const DEFAULT_AUTH_PROFILE_NAME = "default";
const AUTH_PROFILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export function getAuthStorageStatePath(rootDir: string, name = DEFAULT_AUTH_PROFILE_NAME): string {
  assertValidAuthProfileName(name);
  return join(rootDir, ".possum", "auth", `${name}.json`);
}

export async function recordAuthSession(input: RecordAuthSessionInput): Promise<RecordAuthSessionResult> {
  const profileName = input.name ?? DEFAULT_AUTH_PROFILE_NAME;
  const storageStatePath = getAuthStorageStatePath(input.rootDir, profileName);
  const launchBrowser = input.launchBrowser ?? launchHeadedBrowser;
  const waitForCompletion = input.waitForCompletion ?? waitForEnter;
  const writeOutput = input.stdout ?? (() => undefined);
  let managedRunCommand: ManagedRunCommand | undefined;
  let browser: AuthSessionBrowser | undefined;

  try {
    if (input.runCommand) {
      managedRunCommand = await startRunCommand({
        command: input.runCommand,
        cwd: input.rootDir,
        targetUrl: input.targetUrl
      });
    }

    browser = await launchBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    writeOutput("Log in using the opened browser window, then return here.");
    await waitForCompletion();

    await mkdir(dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
    writeOutput(`Saved auth session to ${storageStatePath}`);

    return { storageStatePath, profileName };
  } finally {
    await browser?.close();
    await managedRunCommand?.stop();
  }
}

export async function updateDefaultAuthConfig(rootDir: string, storageStatePath: string): Promise<boolean> {
  const configPath = getPossumConfigPath(rootDir);
  let raw: string;

  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  const config = JSON.parse(raw) as Record<string, unknown>;
  const auth = isRecord(config.auth) ? config.auth : {};
  config.auth = { ...auth, storageState: toConfigRelativePath(rootDir, storageStatePath) };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return true;
}

function assertValidAuthProfileName(name: string): void {
  if (!AUTH_PROFILE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid auth profile name: ${name}`);
  }
}

async function launchHeadedBrowser(): Promise<AuthSessionBrowser> {
  return chromium.launch({ headless: false });
}

async function waitForEnter(): Promise<void> {
  const rl = createInterface({ input: stdin, output: processStdout });
  try {
    await rl.question("Press Enter after login is complete...");
  } finally {
    rl.close();
  }
}

function toConfigRelativePath(rootDir: string, storageStatePath: string): string {
  const relativePath = relative(rootDir, storageStatePath);
  if (relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath.split(sep).join("/");
  }
  return storageStatePath.split(sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
