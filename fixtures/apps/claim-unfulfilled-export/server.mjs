import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export function createFixtureServer() {
  return createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Export your report as PDF</title>
      <meta name="description" content="Export your report as PDF in one click." />
      <h1>Reportly</h1>
      <p>Export your report as PDF in one click.</p>
      <p>Your report is ready to view below.</p>
      <a href="/">Home</a>`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4183);
  createFixtureServer().listen(port, "127.0.0.1", () => {
    console.log(`claim-unfulfilled-export fixture ready at http://127.0.0.1:${port}`);
  });
}
