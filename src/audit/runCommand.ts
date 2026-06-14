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

export async function startRunCommand(input: StartRunCommandInput): Promise<ManagedRunCommand> {
  const child = spawn(input.command, {
    cwd: input.cwd,
    detached: process.platform !== "win32",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = new ProcessOutputBuffer();
  child.stdout?.on("data", (chunk) => output.push(chunk));
  child.stderr?.on("data", (chunk) => output.push(chunk));

  const exit = waitForExit(child);
  try {
    await waitForReachableUrl({
      child,
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

async function waitForReachableUrl(input: {
  child: ChildProcess;
  command: string;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  output: ProcessOutputBuffer;
  targetUrl: string;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;

  while (Date.now() < deadline) {
    if (input.child.exitCode !== null || input.child.signalCode !== null) {
      await input.exit;
      throw new Error(
        `Run command exited before ${input.targetUrl} became reachable: ${input.command}\n${input.output.text()}`
      );
    }

    try {
      await fetch(input.targetUrl, { signal: AbortSignal.timeout(250) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(
    `Run command did not make ${input.targetUrl} reachable within ${input.timeoutMs}ms: ${input.command}\n${input.output.text()}`
  );
}

async function stopProcess(
  child: ChildProcess,
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exit.catch(() => undefined);
    return;
  }

  signalProcess(child, "SIGTERM");
  const stopped = await Promise.race([exit.then(() => true), delay(2_000).then(() => false)]);
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

function waitForExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
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
