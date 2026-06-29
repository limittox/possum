import http from "node:http";

export function createFixtureServer() {
  return http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <title>Keyboard Inaccessible Fixture</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; }
      .icon-button { width: 40px; height: 40px; }
      .custom-action { display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background: #1f2937; color: white; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Keyboard Inaccessible Fixture</h1>
    <p>This fixture includes controls a keyboard/accessibility pass should flag.</p>
    <button class="icon-button"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"></circle></svg></button>
    <div role="button" class="custom-action" onclick="document.body.dataset.clicked = 'true'">Open menu</div>
  </body>
</html>`);
  });
}
