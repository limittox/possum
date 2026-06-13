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
});
