import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export function createFixtureServer() {
  let submissions = 0;

  return createServer((request, response) => {
    if (request.method === "POST" && request.url === "/comment") {
      submissions += 1;
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (body.includes("<script") || body.includes("%3Cscript")) {
          response.writeHead(500, { "content-type": "text/html" });
          response.end("<h1>Internal Server Error</h1><pre>stack trace</pre>");
          return;
        }

        response.writeHead(200, { "content-type": "text/plain" });
        response.end("ok");
      });
      return;
    }

    if (request.url === "/count") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(String(submissions));
      return;
    }

    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Hostile Fixture</title>
      <h1>Leave comment</h1>
      <form onsubmit="event.preventDefault(); fetch('/comment', { method: 'POST', body: new FormData(this) });">
        <textarea name="comment"></textarea>
        <button type="submit">Post comment</button>
      </form>`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4182);
  createFixtureServer().listen(port, "127.0.0.1", () => {
    console.log(`hostile-server-error fixture ready at http://127.0.0.1:${port}`);
  });
}
