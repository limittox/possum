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
  const diagnosticLines = (report.diagnostics ?? []).map(
    (diagnostic) => `- ${formatDiagnosticPhase(diagnostic.phase)}: ${diagnostic.status} — ${diagnostic.reason}`
  );

  return [
    formatRunTitle(report),
    "",
    `**Target:** ${report.targetUrl}`,
    `**Started:** ${report.startedAt}`,
    report.completedAt ? `**Completed:** ${report.completedAt}` : undefined,
    `**Personas:** ${report.personas.join(", ")}`,
    "",
    "## Findings",
    ...findingLines,
    ...(diagnosticLines.length > 0 ? ["", "## Diagnostics", ...diagnosticLines] : []),
    ""
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function formatDiagnosticPhase(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function formatRunTitle(report: RunReport): string {
  switch (report.runType) {
    case "feature_verification":
      return `# Possum Feature Verification ${report.runId}`;
    case "app_verification":
      return `# Possum App Verification ${report.runId}`;
    case "audit":
      return `# Possum Audit ${report.runId}`;
  }
}
