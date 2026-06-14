import { spawn, type ChildProcess } from "node:child_process";

export interface StartRunCommandInput {
  command: string;
  cwd: string;
  targetUrl: string;
  timeoutMs?: number;
}

export interface ManagedRunCommand {
  stop: () => Promise<void>;
}

interface ParsedRunCommand {
  args: string[];
  env: Record<string, string>;
  executable: string;
}

interface RunCommandExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export async function startRunCommand(input: StartRunCommandInput): Promise<ManagedRunCommand> {
  const parsedCommand = parseRunCommand(input.command);
  const child = spawn(parsedCommand.executable, parsedCommand.args, {
    cwd: input.cwd,
    detached: process.platform !== "win32",
    env: { ...process.env, ...parsedCommand.env },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = new ProcessOutputBuffer();
  child.stdout?.on("data", (chunk) => output.push(chunk));
  child.stderr?.on("data", (chunk) => output.push(chunk));

  const exit = waitForExit(child, parsedCommand.executable);
  try {
    await waitForReachableUrl({
      command: input.command,
      exit,
      output,
      targetUrl: input.targetUrl,
      timeoutMs: input.timeoutMs ?? 10_000
    });
  } catch (error) {
    await stopProcess(child, exit);
    throw error;
  }

  return {
    stop: () => stopProcess(child, exit)
  };
}

function parseRunCommand(command: string): ParsedRunCommand {
  const tokens = tokenizeRunCommand(command);
  const env: Record<string, string> = {};

  while (tokens.length > 0 && isEnvironmentAssignment(tokens[0])) {
    const assignment = tokens.shift() ?? "";
    const equalsIndex = assignment.indexOf("=");
    env[assignment.slice(0, equalsIndex)] = assignment.slice(equalsIndex + 1);
  }

  const executable = tokens.shift();
  if (!executable) {
    throwRejectedRunCommand("missing executable");
  }

  if (executable.includes("/") || executable.includes("\\")) {
    throwRejectedRunCommand("executable must be a bare command from PATH");
  }

  if (executable.startsWith("-")) {
    throwRejectedRunCommand("executable must not start with a dash");
  }

  return { args: tokens, env, executable };
}

function tokenizeRunCommand(command: string): string[] {
  if (command.trim().length === 0) {
    throwRejectedRunCommand("command is empty");
  }

  if (/[\r\n]/.test(command)) {
    throwRejectedRunCommand("newlines are not allowed");
  }

  if (command.includes("`") || command.includes("$(")) {
    throwRejectedRunCommand("command substitution is not allowed");
  }

  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (!quote && /[;&|<>]/.test(char)) {
      throwRejectedRunCommand("shell chaining, backgrounding, pipes, and redirection are not allowed");
    }

    if ((char === "'" || char === '"') && (!quote || quote === char)) {
      quote = quote ? undefined : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }
      continue;
    }

    token += char;
  }

  if (quote) {
    throwRejectedRunCommand("unterminated quote");
  }

  if (token.length > 0) {
    tokens.push(token);
  }

  return tokens;
}

function isEnvironmentAssignment(token: string | undefined): token is string {
  return /^[A-Za-z_][A-Za-z0-9_]*=.+$/u.test(token ?? "");
}

function throwRejectedRunCommand(reason: string): never {
  throw new Error(`Run command rejected by Possum command sandbox: ${reason}.`);
}

async function waitForReachableUrl(input: {
  command: string;
  exit: Promise<RunCommandExit>;
  output: ProcessOutputBuffer;
  targetUrl: string;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;
  const exitState = input.exit.then(
    (result) => ({ result, type: "exit" as const }),
    (error: unknown) => ({ error, type: "error" as const })
  );

  while (Date.now() < deadline) {
    const event = await Promise.race([
      fetch(input.targetUrl, { signal: AbortSignal.timeout(250) })
        .then(() => ({ type: "reachable" as const }))
        .catch(() => delay(100).then(() => ({ type: "retry" as const }))),
      exitState
    ]);

    if (event.type === "reachable") {
      return;
    }

    if (event.type === "error") {
      throw event.error;
    }

    if (event.type === "exit") {
      throw new Error(
        `Run command exited before ${input.targetUrl} became reachable: ${input.command}\n${input.output.text()}`
      );
    }
  }

  throw new Error(
    `Run command did not make ${input.targetUrl} reachable within ${input.timeoutMs}ms: ${input.command}\n${input.output.text()}`
  );
}

async function stopProcess(child: ChildProcess, exit: Promise<RunCommandExit>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exit.catch(() => undefined);
    return;
  }

  signalProcess(child, "SIGTERM");
  const stopped = await Promise.race([exit.then(() => true, () => true), delay(2_000).then(() => false)]);
  if (!stopped) {
    signalProcess(child, "SIGKILL");
    await exit.catch(() => undefined);
  }
}

function signalProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  } catch {
    // Process already exited.
  }
}

function waitForExit(child: ChildProcess, executable: string): Promise<RunCommandExit> {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      reject(new Error(`Run command failed to start: ${executable}: ${error.message}`));
    });
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ProcessOutputBuffer {
  private readonly chunks: string[] = [];
  private length = 0;
  private readonly maxLength = 4000;

  push(chunk: Buffer | string): void {
    const value = chunk.toString();
    this.chunks.push(value);
    this.length += value.length;

    while (this.length > this.maxLength && this.chunks.length > 0) {
      const removed = this.chunks.shift() ?? "";
      this.length -= removed.length;
    }
  }

  text(): string {
    return this.chunks.join("").trim();
  }
}
