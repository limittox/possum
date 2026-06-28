import { basename, dirname } from "node:path";
import { Finding } from "../contracts/findings.js";

export interface DebugBundleArtifactPaths {
  report: string;
  trace: string;
  repro: string;
  debug: string;
  repairHints: string;
  screenshots: string[];
}

export type DebugTimelineEntry = Record<string, unknown>;

export interface FindingDebugBundle {
  findingId: string;
  persona: Finding["persona"];
  severity: Finding["severity"];
  summary: string;
  artifacts: DebugBundleArtifactPaths;
  timeline: DebugTimelineEntry[];
  repairHints: string[];
}

export interface CreateDebugBundleInput {
  finding: Finding;
  trace: unknown;
}

export function createDebugBundle(input: CreateDebugBundleInput): FindingDebugBundle {
  const findingDir = dirname(input.finding.evidence.trace);

  return {
    findingId: input.finding.id,
    persona: input.finding.persona,
    severity: input.finding.severity,
    summary: input.finding.actual,
    artifacts: {
      report: `${findingDir}/report.md`,
      trace: input.finding.evidence.trace,
      repro: input.finding.evidence.repro,
      debug: `${findingDir}/debug.json`,
      repairHints: `${findingDir}/repair-hints.md`,
      screenshots: input.finding.evidence.screenshots
    },
    timeline: extractTimeline(input.trace),
    repairHints: createRepairHints(input.finding)
  };
}

export function renderRepairHintsMarkdown(bundle: FindingDebugBundle): string {
  return [
    `# Repair hints for ${bundle.findingId}`,
    "",
    "## Summary",
    bundle.summary,
    "",
    "## Suggested next steps",
    ...bundle.repairHints.map((hint) => `- ${hint}`),
    "",
    "## Artifacts",
    `- Debug JSON: ${basename(bundle.artifacts.debug)}`,
    `- Trace: ${basename(bundle.artifacts.trace)}`,
    `- Repro: ${basename(bundle.artifacts.repro)}`,
    bundle.artifacts.screenshots.length > 0 ? `- Screenshots: ${bundle.artifacts.screenshots.join(", ")}` : undefined,
    ""
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function extractTimeline(trace: unknown): DebugTimelineEntry[] {
  if (!isRecord(trace)) {
    return [];
  }

  const actions = trace.actions;
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.filter(isRecord);
}

function createRepairHints(finding: Finding): string[] {
  const hints = ["Run the generated repro after fixing the issue."];

  if (finding.id === "finding_hostile_server_error_001") {
    return ["Inspect validation and error handling for unexpected input.", ...hints];
  }

  if (finding.id === "finding_impatient_double_submit_001") {
    return ["Inspect duplicate-submit guards, disabled states, debouncing, or idempotency for the submitted action.", ...hints];
  }

  if (finding.id === "finding_beginner_dead_end_001") {
    return ["Add a visible next action, link, or call to action for first-time customers.", ...hints];
  }

  if (finding.id === "finding_beginner_access_001") {
    return ["Check that the app starts successfully and that the configured target URL is reachable.", ...hints];
  }

  if (finding.id.startsWith("finding_claim_unfulfilled_")) {
    return ["Compare the product claim with the browser UI; either implement the behavior or update the claim.", ...hints];
  }

  if (finding.id.startsWith("finding_feature_check_")) {
    return ["Inspect the feature flow and rerun `possum verify-feature` or `possum verify-diff` after fixing it.", ...hints];
  }

  return ["Inspect the trace and repro to identify the customer-visible failure path.", ...hints];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
