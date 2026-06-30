import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/audit.js";
import { probeTargetSurface } from "../src/audit/surfaceProbe.js";

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

async function serveAuthenticatedHtml(): Promise<string> {
  const server = createServer((request, response) => {
    const isAuthenticated = request.headers.cookie?.includes("session=1") ?? false;
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      isAuthenticated
        ? "<title>Dashboard</title><h1>Welcome back</h1><a href='/account'>Account</a>"
        : "<title>Sign in</title><h1>Please sign in</h1>"
    );
  });

  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

async function waitForUnreachable(url: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(200) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`${url} still reachable`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

async function serveHostileErrorForm(): Promise<{ targetUrl: string; submissions: () => number }> {
  let submissions = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/comment") {
      submissions += 1;
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (body.includes("<script")) {
          response.writeHead(500, { "content-type": "text/html" });
          response.end("<h1>Internal Server Error</h1><pre>stack trace</pre>");
          return;
        }

        response.writeHead(200, { "content-type": "text/plain" });
        response.end("ok");
      });
      return;
    }

    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Comment</title>
      <h1>Leave comment</h1>
      <form onsubmit="event.preventDefault(); fetch('/comment', { method: 'POST', body: new FormData(this) });">
        <textarea name="comment"></textarea>
        <button type="submit">Post comment</button>
      </form>`);
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { targetUrl: `http://127.0.0.1:${address.port}`, submissions: () => submissions };
}

describe("runAudit", () => {
  it("uses Playwright storage state when probing the target surface", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-auth-surface-"));
    const targetUrl = await serveAuthenticatedHtml();
    const storageState = join(root, ".possum/auth/default.json");
    await mkdir(join(root, ".possum/auth"), { recursive: true });
    await writeFile(
      storageState,
      JSON.stringify({
        cookies: [
          {
            name: "session",
            value: "1",
            domain: "127.0.0.1",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "Lax"
          }
        ],
        origins: []
      }),
      "utf8"
    );

    const surface = await probeTargetSurface({ rootDir: root, targetUrl, storageState });

    expect(surface.title).toBe("Dashboard");
    expect(surface.headings).toContain("Welcome back");
  });

  it("writes surface.json for a reachable app", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-real-audit-"));
    await writeFile(join(root, "README.md"), "# Reachable App\n\nCustomers can launch a workspace in minutes.\n", "utf8");
    const targetUrl = await serveHtml("<title>Reachable App</title><h1>Welcome</h1>");

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const surfaceJson = await readFile(join(result.runDir, "surface.json"), "utf8");
    expect(surfaceJson).toContain("\"title\": \"Reachable App\"");
    expect(surfaceJson).toContain("\"source\": \"homepage\"");
    expect(surfaceJson).toContain("\"source\": \"readme\"");
    expect(surfaceJson).toContain("Customers can launch a workspace in minutes.");
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

  it("starts the target app from a run command and stops it after audit", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-run-command-audit-"));
    const port = await getAvailablePort();
    const targetUrl = `http://127.0.0.1:${port}`;
    const fixturePath = join(process.cwd(), "fixtures", "apps", "beginner-dead-end", "server.mjs");

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      runCommand: `PORT=${port} node ${JSON.stringify(fixturePath)}`,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("finding_beginner_dead_end_001");
    await waitForUnreachable(targetUrl);
  });

  it("rejects unsafe run commands before shell startup", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-unsafe-run-command-"));
    const markerPath = join(root, "unsafe-command-ran.txt");

    const result = await runAudit({
      rootDir: root,
      targetUrl: "http://127.0.0.1:65534",
      runCommand: `node -e "console.log('unsafe')" > ${JSON.stringify(markerPath)}`,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("finding_beginner_access_001");
    expect(findingsJson).toContain("Run command rejected by Possum command sandbox");
    await expect(pathExists(markerPath)).resolves.toBe(false);
  });

  it("reports an access finding when the run command executable is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-missing-run-command-"));

    const result = await runAudit({
      rootDir: root,
      targetUrl: "http://127.0.0.1:65534",
      runCommand: "missing-possum-dev-command --port 3000",
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("finding_beginner_access_001");
    expect(findingsJson).toContain("Run command failed to start");
    expect(findingsJson).toContain("missing-possum-dev-command");
  });

  it("reports a clear access finding for browser-blocked target ports", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-blocked-port-audit-"));

    const result = await runAudit({
      rootDir: root,
      targetUrl: "http://127.0.0.1:4190",
      runCommand: "missing-possum-dev-command --port 4190",
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("Port 4190 is blocked by browser security");
    expect(findingsJson).toContain("Use a different local port");
    expect(findingsJson).not.toContain("missing-possum-dev-command");
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

    expect(submissions()).toBeGreaterThanOrEqual(2);

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

  it("reports a hostile finding when unexpected input causes a server error", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-hostile-audit-"));
    const { targetUrl, submissions } = await serveHostileErrorForm();

    const result = await runAudit({
      rootDir: root,
      targetUrl,
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    expect(submissions()).toBe(3);

    const findingsJson = await readFile(join(result.runDir, "findings.json"), "utf8");
    expect(findingsJson).toContain("finding_hostile_server_error_001");
    expect(findingsJson).toContain("HTTP 500");

    const findingDir = join(result.runDir, "findings", "finding_hostile_server_error_001");
    await expect(readFile(join(findingDir, "report.md"), "utf8")).resolves.toContain(
      "# finding_hostile_server_error_001"
    );
    await expect(readFile(join(findingDir, "trace.json"), "utf8")).resolves.toContain(
      '"action": "submit_hostile_payload"'
    );
  });

  it("reports an access finding when the app is unreachable", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-unreachable-audit-"));

    const result = await runAudit({
      rootDir: root,
      targetUrl: "http://127.0.0.1:65534",
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
      targetUrl: "http://127.0.0.1:65534",
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    const findingDir = join(result.runDir, "findings", "finding_beginner_access_001");
    await expect(readFile(join(findingDir, "report.md"), "utf8")).resolves.toContain(
      "# finding_beginner_access_001"
    );
    await expect(readFile(join(findingDir, "trace.json"), "utf8")).resolves.toContain("\"navigate\"");
    await expect(readFile(join(findingDir, "repro.spec.ts"), "utf8")).resolves.toContain(
      "http://127.0.0.1:65534"
    );
    await expect(readFile(join(result.runDir, "playwright.config.ts"), "utf8")).resolves.toContain(
      "testDir: \".\""
    );
  });
});
