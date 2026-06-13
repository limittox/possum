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

async function serveDoubleSubmitForm(): Promise<{ targetUrl: string; submissions: () => number }> {
  let submissions = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/signup") {
      submissions += 1;
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("created");
      return;
    }

    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Signup</title>
      <h1>Create account</h1>
      <form onsubmit="event.preventDefault(); fetch('/signup', { method: 'POST' });">
        <input name="email" />
        <button type="submit">Create account</button>
      </form>`);
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { targetUrl: `http://127.0.0.1:${address.port}`, submissions: () => submissions };
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
    expect(surfaceJson).toContain("\"screenshot\": \"personas/beginner/screenshots/first-page.png\"");

    const screenshot = await readFile(join(result.runDir, "personas", "beginner", "screenshots", "first-page.png"));
    expect([...screenshot.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("writes a beginner browser trace for a reachable app", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-beginner-trace-"));
    const targetUrl = await serveHtml('<title>Trace App</title><h1>Welcome</h1><a href="/start">Start</a>');

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const traceJson = await readFile(join(result.runDir, "personas", "beginner", "trace.json"), "utf8");
    expect(traceJson).toContain('"persona": "beginner"');
    expect(traceJson).toContain('"action": "navigate"');
    expect(traceJson).toContain('"action": "click_link"');
    expect(traceJson).toContain('"text": "Start"');
    expect(traceJson).toContain('"href": "/start"');

    const trace = JSON.parse(traceJson) as { steps: Array<{ action: string; finalUrl?: string }> };
    expect(trace.steps).toContainEqual(expect.objectContaining({ action: "after_click", finalUrl: `${targetUrl}/start` }));
  });

  it("reports a beginner dead-end finding for a reachable page with no actions", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-dead-end-audit-"));
    const targetUrl = await serveHtml("<title>Dead End</title><h1>Welcome</h1>");

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("finding_beginner_dead_end_001");
    expect(findingsJson).toContain("personas/beginner/screenshots/first-page.png");
    await expect(
      readFile(join(result.runDir, "findings", "finding_beginner_dead_end_001", "repro.spec.ts"), "utf8")
    ).resolves.toContain(targetUrl);
  });

  it("reports an impatient finding when a form submits twice from rapid clicks", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-impatient-audit-"));
    const { targetUrl, submissions } = await serveDoubleSubmitForm();

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    expect(submissions()).toBe(2);

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("finding_impatient_double_submit_001");
    expect(findingsJson).toContain("submitted 2 times");

    const findingDir = join(result.runDir, "findings", "finding_impatient_double_submit_001");
    await expect(readFile(join(findingDir, "report.md"), "utf8")).resolves.toContain(
      "# finding_impatient_double_submit_001"
    );
    await expect(readFile(join(findingDir, "trace.json"), "utf8")).resolves.toContain(
      '"action": "double_submit"'
    );
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
    await expect(readFile(join(result.runDir, "playwright.config.ts"), "utf8")).resolves.toContain(
      "testDir: \".\""
    );
  });
});
