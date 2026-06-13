import { describe, expect, it } from "vitest";
import { getPossumMcpToolNames } from "../src/mcp/server.js";

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
});
