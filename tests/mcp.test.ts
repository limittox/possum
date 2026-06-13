import { describe, expect, it } from "vitest";
import { createPossumMcpServer, getPossumMcpToolNames } from "../src/mcp/server.js";

describe("Possum MCP server", () => {
  it("exposes coding-agent audit tools", () => {
    expect(getPossumMcpToolNames()).toEqual([
      "run_audit",
      "list_findings",
      "get_finding",
      "replay_finding",
      "get_report"
    ]);
  });

  it("creates an MCP server instance for stdio clients", () => {
    const server = createPossumMcpServer();

    expect(server).toHaveProperty("connect");
  });
});
