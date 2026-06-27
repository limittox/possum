import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";
import { z } from "zod";
import * as z4 from "zod/v4";
import { runAudit } from "../audit/audit.js";
import { resolveAuditTarget } from "../config/appConfig.js";
import { buildReplayCommand } from "../replay/replayCommand.js";
import { resolveClaimVerification } from "../llm/resolveLlmClient.js";
import { createRunStore, readFinding, readReportMarkdown, readRunReport } from "../runs/runStore.js";

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

export interface PossumMcpDependencies {
  rootDir?: string;
  now?: Date;
}

export function createPossumMcpServer(dependencies: PossumMcpDependencies = {}): McpServer {
  const server = new McpServer(
    { name: "possum", version: "0.1.0" },
    {
      instructions:
        "Run local Possum customer audits, inspect findings, read reports, and return replay commands for coding agents."
    }
  );

  server.registerTool(
    "run_audit",
    {
      description: "Run local Possum audit against target URL or possum.config.json.",
      inputSchema: {
        rootDir: z4.string().optional().describe("Repository root. Defaults MCP server working directory."),
        runCommand: z4.string().optional().describe("Sandboxed command start local app before auditing."),
        targetUrl: z4.string().url().optional().describe("Local app URL audit. Defaults to possum.config.json.")
      }
    },
    async (args) => runPossumMcpTool("run_audit", args, dependencies)
  );

  server.registerTool(
    "list_findings",
    {
      description: "List findings for Possum run.",
      inputSchema: {
        rootDir: z4.string().optional().describe("Repository root. Defaults to MCP server working directory."),
        runId: z4.string().min(1).describe("Run id under .possum/runs.")
      }
    },
    async (args) => runPossumMcpTool("list_findings", args, dependencies)
  );

  server.registerTool(
    "get_finding",
    {
      description: "Return single finding packet from Possum run.",
      inputSchema: {
        rootDir: z4.string().optional().describe("Repository root. Defaults MCP server working directory."),
        runId: z4.string().min(1).describe("Run id under .possum/runs."),
        findingId: z4.string().min(1).describe("Finding id retrieve.")
      }
    },
    async (args) => runPossumMcpTool("get_finding", args, dependencies)
  );

  server.registerTool(
    "replay_finding",
    {
      description: "Return Playwright replay command for generated repro path.",
      inputSchema: {
        rootDir: z4.string().optional().describe("Repository root. Defaults MCP server working directory."),
        reproPath: z4.string().min(1).describe("Path generated repro.spec.ts file.")
      }
    },
    async (args) => runPossumMcpTool("replay_finding", args, dependencies)
  );

  server.registerTool(
    "get_report",
    {
      description: "Return Markdown report for Possum run.",
      inputSchema: {
        rootDir: z4.string().optional().describe("Repository root. Defaults to MCP server working directory."),
        runId: z4.string().min(1).describe("Run id under .possum/runs.")
      }
    },
    async (args) => runPossumMcpTool("get_report", args, dependencies)
  );

  return server;
}

export async function startPossumMcpServer(dependencies: PossumMcpDependencies = {}): Promise<void> {
  const server = createPossumMcpServer(dependencies);
  await server.connect(new StdioServerTransport());
}

const RunAuditArgsSchema = z.object({
  rootDir: z.string().optional(),
  runCommand: z.string().optional(),
  targetUrl: z.string().url().optional()
});

const RunScopedArgsSchema = z.object({
  rootDir: z.string().optional(),
  runId: z.string().min(1)
});

const GetFindingArgsSchema = RunScopedArgsSchema.extend({
  findingId: z.string().min(1)
});

const ReplayFindingArgsSchema = z.object({
  rootDir: z.string().optional(),
  reproPath: z.string().min(1)
});

export async function runPossumMcpTool(
  name: PossumMcpToolName,
  rawArgs: unknown,
  dependencies: PossumMcpDependencies = {}
): Promise<CallToolResult> {
  switch (name) {
    case "run_audit":
      return runAuditTool(rawArgs, dependencies);
    case "list_findings":
      return listFindingsTool(rawArgs, dependencies);
    case "get_finding":
      return getFindingTool(rawArgs, dependencies);
    case "replay_finding":
      return replayFindingTool(rawArgs, dependencies);
    case "get_report":
      return getReportTool(rawArgs, dependencies);
  }
}

async function runAuditTool(rawArgs: unknown, dependencies: PossumMcpDependencies): Promise<CallToolResult> {
  const args = RunAuditArgsSchema.parse(rawArgs);
  const rootDir = resolveRootDir(args.rootDir, dependencies);
  const target = await resolveAuditTarget({
    rootDir,
    runCommand: args.runCommand,
    targetUrl: args.targetUrl
  });
  const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
  const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
  const result = await runAudit({
    rootDir,
    runCommand: target.runCommand,
    targetUrl: target.targetUrl,
    now: dependencies.now,
    claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
      requestTimeoutMs,
      budgetMs
    })
  });
  const report = await readRunReport(createRunStore(rootDir), result.runId);
  const structuredContent = {
    runId: result.runId,
    targetUrl: target.targetUrl,
    reportMarkdownPath: result.reportMarkdownPath,
    findingsJsonPath: result.findingsJsonPath,
    surfaceJsonPath: result.surfaceJsonPath,
    findingsCount: report.findings.length
  };

  return textResult(`Possum audit created ${result.runId}`, structuredContent);
}

async function listFindingsTool(rawArgs: unknown, dependencies: PossumMcpDependencies): Promise<CallToolResult> {
  const args = RunScopedArgsSchema.parse(rawArgs);
  const rootDir = resolveRootDir(args.rootDir, dependencies);
  const report = await readRunReport(createRunStore(rootDir), args.runId);
  const findings = report.findings.map((finding) => ({
    id: finding.id,
    persona: finding.persona,
    severity: finding.severity,
    confidence: finding.confidence,
    mission: finding.mission
  }));

  return textResult(JSON.stringify({ runId: args.runId, findings }, null, 2), { runId: args.runId, findings });
}

async function getFindingTool(rawArgs: unknown, dependencies: PossumMcpDependencies): Promise<CallToolResult> {
  const args = GetFindingArgsSchema.parse(rawArgs);
  const rootDir = resolveRootDir(args.rootDir, dependencies);
  const finding = await readFinding(createRunStore(rootDir), args.runId, args.findingId);

  if (!finding) {
    return {
      isError: true,
      content: [{ type: "text", text: `Finding ${args.findingId} was not found in run ${args.runId}.` }]
    };
  }

  return textResult(JSON.stringify(finding, null, 2), finding);
}

async function replayFindingTool(rawArgs: unknown, dependencies: PossumMcpDependencies): Promise<CallToolResult> {
  const args = ReplayFindingArgsSchema.parse(rawArgs);
  const rootDir = resolveRootDir(args.rootDir, dependencies);
  const replay = buildReplayCommand(rootDir, args.reproPath);
  const command = [replay.command, ...replay.args].join(" ");

  return textResult(command, { command });
}

async function getReportTool(rawArgs: unknown, dependencies: PossumMcpDependencies): Promise<CallToolResult> {
  const args = RunScopedArgsSchema.parse(rawArgs);
  const rootDir = resolveRootDir(args.rootDir, dependencies);
  const report = await readReportMarkdown(createRunStore(rootDir), args.runId);

  return textResult(report, { runId: args.runId });
}

function resolveRootDir(rootDir: string | undefined, dependencies: PossumMcpDependencies): string {
  return resolve(rootDir ?? dependencies.rootDir ?? process.cwd());
}

function textResult(text: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}
