import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export function createFixtureServer() {
  let submissions = 0;

  return createServer((request, response) => {
    if (request.method === "POST" && request.url === "/signup") {
      submissions += 1;
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(`created ${submissions}`);
      return;
    }

    if (request.url === "/count") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(String(submissions));
      return;
    }

    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Impatient Fixture</title>
      <h1>Create account</h1>
      <form onsubmit="event.preventDefault(); fetch('/signup', { method: 'POST' });">
        <input name="email" />
        <button type="submit">Create account</button>
      </form>`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4181);
  createFixtureServer().listen(port, "127.0.0.1", () => {
    console.log(`impatient-double-submit fixture ready at http://127.0.0.1:${port}`);
  });
}
