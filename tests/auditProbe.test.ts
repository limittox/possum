import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/audit.js";

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

describe("runAudit", () => {
  it("writes surface.json for a reachable app", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-real-audit-"));
    const targetUrl = await serveHtml("<title>Reachable App</title><h1>Welcome</h1>");

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const surfaceJson = await readFile(join(result.runDir, "surface.json"), "utf8");
    expect(surfaceJson).toContain("\"title\": \"Reachable App\"");
  });

  it("reports an access finding when the app is unreachable", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-unreachable-audit-"));

    const result = await runAudit({
      rootDir: root,
      targetUrl: "http://127.0.0.1:9",
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("finding_beginner_access_001");
    expect(findingsJson).toContain("could not reach the app");
  });

  it("writes report, trace, and repro files for an access finding", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-access-artifacts-"));

    const result = await runAudit({
      rootDir: root,
      targetUrl: "http://127.0.0.1:9",
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingDir = join(result.runDir, "findings", "finding_beginner_access_001");
    await expect(readFile(join(findingDir, "report.md"), "utf8")).resolves.toContain(
      "# finding_beginner_access_001"
    );
    await expect(readFile(join(findingDir, "trace.json"), "utf8")).resolves.toContain("\"navigate\"");
    await expect(readFile(join(findingDir, "repro.spec.ts"), "utf8")).resolves.toContain(
      "http://127.0.0.1:9"
    );
  });
});
