import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
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

describe("probeTargetSurface", () => {
  it("extracts basic customer-facing surface facts from HTML", async () => {
    const targetUrl = await serveHtml(`
      <!doctype html>
      <html>
        <head><title>Project Pilot</title></head>
        <body>
          <h1>Create your first project</h1>
          <a href="/signup">Start free</a>
          <button>Invite team</button>
          <form action="/projects" method="post">
            <input name="project_name" />
            <input name="email" />
          </form>
        </body>
      </html>
    `);

    const surface = await probeTargetSurface({ targetUrl });

    expect(surface.title).toBe("Project Pilot");
    expect(surface.headings).toEqual(["Create your first project"]);
    expect(surface.links).toContainEqual({ text: "Start free", href: "/signup" });
    expect(surface.buttons).toEqual(["Invite team"]);
    expect(surface.forms).toEqual([{ action: "/projects", method: "post", inputs: ["project_name", "email"] }]);
  });
});
