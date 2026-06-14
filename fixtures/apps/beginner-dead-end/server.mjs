import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export function createFixtureServer() {
  return createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Dead End Fixture</title>
      <h1>Welcome</h1>
      <p>This page intentionally has no links, buttons, or forms.</p>`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4180);
  createFixtureServer().listen(port, "127.0.0.1", () => {
    console.log(`beginner-dead-end fixture ready at http://127.0.0.1:${port}`);
  });
}
