export const POSSUM_MCP_TOOL_NAMES = [
  "run_audit",
  "list_findings",
  "get_finding",
  "replay_finding",
  "get_report"
] as const;

export type PossumMcpToolName = (typeof POSSUM_MCP_TOOL_NAMES)[number];

export function getPossumMcpToolNames(): PossumMcpToolName[] {
  return [...POSSUM_MCP_TOOL_NAMES];
}
