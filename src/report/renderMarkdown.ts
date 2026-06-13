import { Finding, RunReport } from "../contracts/findings.js";

export function renderFindingMarkdown(finding: Finding): string {
  return [
    `# ${finding.id}`,
    "",
    `**Persona:** ${finding.persona}`,
    `**Severity:** ${finding.severity}`,
    `**Confidence:** ${finding.confidence}`,
    "",
    "## Mission",
    finding.mission,
    "",
    "## Expected",
    finding.expected,
    "",
    "## Actual",
    finding.actual,
    "",
    "## Repro",
    `Run: npx playwright test ${finding.evidence.repro}`,
    ""
  ].join("\n");
}

export function renderRunMarkdown(report: RunReport): string {
  const findingLines =
    report.findings.length === 0
      ? ["No confirmed findings."]
      : report.findings.map((finding) => `- ${finding.id} (${finding.persona}, ${finding.severity})`);

  return [
    `# Possum Audit ${report.runId}`,
    "",
    `**Target:** ${report.targetUrl}`,
    `**Started:** ${report.startedAt}`,
    report.completedAt ? `**Completed:** ${report.completedAt}` : undefined,
    `**Personas:** ${report.personas.join(", ")}`,
    "",
    "## Findings",
    ...findingLines,
    ""
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
