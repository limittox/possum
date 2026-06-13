import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPossumMcpTool } from "../src/mcp/server.js";

const servers: Array<ReturnType<typeof createServer>> = [];

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

async function serveHtml(html: string): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  });

  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("runPossumMcpTool", () => {
  it("runs an audit and returns structured run data", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-mcp-run-"));
    const targetUrl = await serveHtml('<title>MCP Fixture</title><h1>Hello</h1><a href="/start">Start</a>');

    const result = await runPossumMcpTool(
      "run_audit",
      { rootDir, targetUrl },
      { now: new Date("2026-06-13T02:00:00.000Z") }
    );

    expect(result.structuredContent).toMatchObject({
      runId: "run_20260613_020000",
      targetUrl,
      findingsCount: 0
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("run_20260613_020000")
    });
  });

  it("lists findings and returns a report for a run", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-mcp-report-"));
    const targetUrl = await serveHtml('<title>MCP Report</title><button>Start</button>');

    await runPossumMcpTool("run_audit", { rootDir, targetUrl }, { now: new Date("2026-06-13T02:00:00.000Z") });

    const list = await runPossumMcpTool("list_findings", { rootDir, runId: "run_20260613_020000" });
    expect(list.structuredContent).toEqual({ runId: "run_20260613_020000", findings: [] });

    const report = await runPossumMcpTool("get_report", { rootDir, runId: "run_20260613_020000" });
    expect(report.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("# Possum Audit run_20260613_020000")
    });
  });

  it("returns a replay command for a repro path", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-mcp-replay-"));

    const result = await runPossumMcpTool("replay_finding", {
      rootDir,
      reproPath: "findings/finding_beginner_access_001/repro.spec.ts"
    });

    expect(result.structuredContent).toEqual({
      command: `npx playwright test ${join(rootDir, "findings/finding_beginner_access_001/repro.spec.ts")}`
    });
  });
});
