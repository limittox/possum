import { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/audit.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

interface FixtureServer {
  listen(port: number, host: string, callback: () => void): void;
  close(callback: (error?: Error) => void): void;
  address(): AddressInfo | string | null;
}

const servers: FixtureServer[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
  servers.length = 0;
});

async function startFixture(fixture: string): Promise<string> {
  const moduleUrl = pathToFileURL(join(process.cwd(), "fixtures", "apps", fixture, "server.mjs")).href;
  const module = (await import(moduleUrl)) as {
    createFixtureServer: () => FixtureServer;
  };
  const server = module.createFixtureServer();
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function auditFixture(fixture: string): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), `possum-${fixture}-fixture-`));
  const targetUrl = await startFixture(fixture);
  const result = await runAudit({
    rootDir: root,
    targetUrl,
    now: new Date("2026-06-13T02:00:00.000Z")
  });
  const report = await import("node:fs/promises").then(({ readFile }) =>
    readFile(join(result.runDir, "findings.json"), "utf8")
  );
  return JSON.parse(report).findings.map((finding: { id: string }) => finding.id);
}

describe("fixture apps", () => {
  it("beginner-dead-end fixture reproduces the beginner dead-end finding", async () => {
    await expect(auditFixture("beginner-dead-end")).resolves.toContain("finding_beginner_dead_end_001");
  });

  it("impatient-double-submit fixture reproduces the impatient double-submit finding", async () => {
    await expect(auditFixture("impatient-double-submit")).resolves.toContain(
      "finding_impatient_double_submit_001"
    );
  });

  it("hostile-server-error fixture reproduces the hostile server-error finding", async () => {
    await expect(auditFixture("hostile-server-error")).resolves.toContain("finding_hostile_server_error_001");
  });

  it("keyboard-inaccessible fixture reproduces a keyboard finding", async () => {
    await expect(auditFixture("keyboard-inaccessible")).resolves.toContain("finding_keyboard_missing_name_001");
  }, 30_000);

  it("claim-unfulfilled-export fixture reproduces the claim-unfulfilled finding", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-claim-unfulfilled-fixture-"));
    const targetUrl = await startFixture("claim-unfulfilled-export");
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "An export-to-PDF control is reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." }),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." })
    ]);

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      claimVerification: { llm, models: { personaModel: "agent-model" }, maxSteps: 3, attempts: 2, budgetMs: 60_000 }
    });

    const report = await import("node:fs/promises").then(({ readFile }) =>
      readFile(join(result.runDir, "findings.json"), "utf8")
    );
    const ids = JSON.parse(report).findings.map((finding: { id: string }) => finding.id);
    expect(ids).toContain("finding_claim_unfulfilled_001");
  }, 30_000);
});
