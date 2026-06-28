import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli/main.js";

describe("CLI app config", () => {
  it("initializes a starter possum.config.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-init-"));
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line)
    });

    await program.parseAsync(["node", "possum", "init"]);

    const config = JSON.parse(await readFile(join(root, "possum.config.json"), "utf8"));
    expect(config).toEqual({
      target: {
        url: "http://localhost:3000",
        command: "npm run dev"
      }
    });
    expect(output.join("\n")).toContain("Created possum.config.json");
  });

  it("initializes .gitignore to exclude Possum run and auth artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-init-gitignore-"));
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line)
    });

    await program.parseAsync(["node", "possum", "init"]);

    await expect(readFile(join(root, ".gitignore"), "utf8")).resolves.toBe(".possum/runs/\n.possum/auth/\n");
  });

  it("appends Possum run and auth artifacts to an existing .gitignore once", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-init-existing-gitignore-"));
    await writeFile(join(root, ".gitignore"), "node_modules\n.next\n", "utf8");
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line)
    });

    await program.parseAsync(["node", "possum", "init"]);

    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(gitignore).toBe("node_modules\n.next\n\n.possum/runs/\n.possum/auth/\n");
  });

  it("does not duplicate existing Possum artifact ignores", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-init-duplicate-gitignore-"));
    await writeFile(join(root, ".gitignore"), "node_modules\n.possum/runs/\n", "utf8");
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line)
    });

    await program.parseAsync(["node", "possum", "init"]);

    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(gitignore.match(/^\.possum\/runs\/$/gm)).toHaveLength(1);
    expect(gitignore.match(/^\.possum\/auth\/$/gm)).toHaveLength(1);
  });

  it("runs audit from possum.config.json when --url is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-config-audit-"));
    const output: string[] = [];
    await writeFile(
      join(root, "possum.config.json"),
      JSON.stringify({ target: { url: "http://127.0.0.1:1" } }),
      "utf8"
    );
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    await program.parseAsync(["node", "possum", "audit"]);

    expect(output.join("\n")).toContain("run_20260613_020000");
    const findings = await readFile(join(root, ".possum/runs/run_20260613_020000/findings.json"), "utf8");
    expect(findings).toContain("http://127.0.0.1:1");
  });

  it("lets explicit audit flags override possum.config.json values", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-config-override-"));
    await writeFile(
      join(root, "possum.config.json"),
      JSON.stringify({ target: { url: "http://127.0.0.1:1" } }),
      "utf8"
    );
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    await program.parseAsync(["node", "possum", "audit", "--url", "http://127.0.0.1:2"]);

    expect(output.join("\n")).toContain("run_20260613_020000");
    const findings = await readFile(join(root, ".possum/runs/run_20260613_020000/findings.json"), "utf8");
    expect(findings).toContain("http://127.0.0.1:2");
    expect(findings).not.toContain("http://127.0.0.1:1");
  });

  it("sandbox-validates target.command from possum.config.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-config-command-"));
    const markerPath = join(root, "marker.txt");
    await writeFile(
      join(root, "possum.config.json"),
      JSON.stringify({
        target: {
          url: "http://127.0.0.1:1",
          command: `node -e "console.log('unsafe')" > ${JSON.stringify(markerPath)}`
        }
      }),
      "utf8"
    );
    const program = buildProgram({
      cwd: root,
      stdout: () => undefined,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    await program.parseAsync(["node", "possum", "audit"]);

    const findings = await readFile(join(root, ".possum/runs/run_20260613_020000/findings.json"), "utf8");
    expect(findings).toContain("Run command rejected by Possum command sandbox");
    await expect(access(markerPath)).rejects.toThrow();
  });
});
