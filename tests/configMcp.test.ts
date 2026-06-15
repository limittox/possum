import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtemp, writeFile } from "node:fs/promises";
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

describe("MCP app config", () => {
  it("runs audit using possum.config.json when targetUrl is omitted", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-mcp-config-"));
    const targetUrl = await serveHtml('<title>MCP Config</title><h1>Welcome</h1><button>Start</button>');
    await writeFile(join(rootDir, "possum.config.json"), JSON.stringify({ target: { url: targetUrl } }), "utf8");

    const result = await runPossumMcpTool(
      "run_audit",
      { rootDir },
      { now: new Date("2026-06-13T02:00:00.000Z") }
    );

    expect(result.structuredContent).toMatchObject({
      runId: "run_20260613_020000",
      targetUrl,
      findingsCount: 0
    });
  });
});
