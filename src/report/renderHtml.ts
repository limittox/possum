import { Finding, RunDiagnostic, RunReport } from "../contracts/findings.js";

const TOP_LEVEL_ARTIFACTS = [
  "findings.json",
  "report.md",
  "surface.json",
  "verification.json",
  "diff-brief.json",
  "playwright.config.ts"
] as const;

export function renderRunHtml(report: RunReport): string {
  const title = formatRunTitle(report);
  const findingCount = report.findings.length;

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    `  <style>${CSS}</style>`,
    "</head>",
    "<body>",
    '  <main class="shell">',
    renderHeader(report, title, findingCount),
    renderDiagnostics(report.diagnostics ?? []),
    renderFindings(report.findings),
    renderRunArtifacts(),
    "  </main>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function renderHeader(report: RunReport, title: string, findingCount: number): string {
  const statusText = findingCount === 0 ? "No confirmed findings" : `${findingCount} confirmed finding${findingCount === 1 ? "" : "s"}`;

  return [
    '    <header class="hero">',
    `      <p class="eyebrow">${escapeHtml(formatRunType(report.runType))}</p>`,
    `      <h1>${escapeHtml(title)}</h1>`,
    `      <p class="status ${findingCount === 0 ? "status-ok" : "status-fail"}">${escapeHtml(statusText)}</p>`,
    '      <dl class="metadata">',
    renderMeta("Run id", report.runId),
    renderMeta("Target", report.targetUrl),
    renderMeta("Started", report.startedAt),
    report.completedAt ? renderMeta("Completed", report.completedAt) : "",
    renderMeta("Personas", report.personas.join(", ")),
    "      </dl>",
    "    </header>"
  ]
    .filter(Boolean)
    .join("\n");
}

function renderDiagnostics(diagnostics: RunDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "";
  }

  return [
    '    <section class="section">',
    "      <h2>Diagnostics</h2>",
    '      <ul class="diagnostics">',
    ...diagnostics.map(
      (diagnostic) =>
        `        <li>${escapeHtml(formatDiagnosticPhase(diagnostic.phase))}: ${escapeHtml(diagnostic.status)} — ${escapeHtml(diagnostic.reason)}</li>`
    ),
    "      </ul>",
    "    </section>"
  ].join("\n");
}

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return [
      '    <section class="section">',
      "      <h2>Findings</h2>",
      '      <p class="empty">No confirmed findings.</p>',
      "    </section>"
    ].join("\n");
  }

  return [
    '    <section class="section">',
    "      <h2>Findings</h2>",
    '      <div class="findings">',
    ...findings.map(renderFindingCard),
    "      </div>",
    "    </section>"
  ].join("\n");
}

function renderFindingCard(finding: Finding): string {
  const findingDir = `findings/${finding.id}`;
  const reproCommand = `npx playwright test ${finding.evidence.repro}`;

  return [
    '        <article class="finding-card">',
    "          <div class=\"finding-heading\">",
    `            <h3>${escapeHtml(finding.id)}</h3>`,
    "            <div class=\"badges\">",
    `              <span class="badge">${escapeHtml(finding.persona)}</span>`,
    `              <span class="badge severity-${escapeAttribute(finding.severity)}">${escapeHtml(finding.severity)}</span>`,
    `              <span class="badge">${escapeHtml(finding.confidence)}</span>`,
    "            </div>",
    "          </div>",
    '          <dl class="finding-details">',
    renderMeta("Mission", finding.mission),
    renderMeta("Expected", finding.expected),
    renderMeta("Actual", finding.actual),
    renderMeta("Reproducibility", `${finding.reproducibility.status} (${finding.reproducibility.attempts} attempt${finding.reproducibility.attempts === 1 ? "" : "s"})`),
    "          </dl>",
    "          <h4>Repro command</h4>",
    `          <pre><code>${escapeHtml(reproCommand)}</code></pre>`,
    renderScreenshots(finding),
    "          <h4>Artifacts</h4>",
    '          <ul class="artifact-list">',
    renderArtifactLink(`${findingDir}/report.md`, "Finding report"),
    renderArtifactLink(finding.evidence.trace, "Trace JSON"),
    renderArtifactLink(`${findingDir}/debug.json`, "Debug JSON"),
    renderArtifactLink(`${findingDir}/repair-hints.md`, "Repair hints"),
    renderArtifactLink(finding.evidence.repro, "Repro spec"),
    "          </ul>",
    "        </article>"
  ].join("\n");
}

function renderScreenshots(finding: Finding): string {
  if (finding.evidence.screenshots.length === 0) {
    return "";
  }

  return [
    "          <h4>Screenshots</h4>",
    '          <div class="screenshots">',
    ...finding.evidence.screenshots.map(
      (screenshot, index) =>
        `            <figure><img src="${escapeAttribute(screenshot)}" alt="${escapeAttribute(`${finding.id} screenshot ${index + 1}`)}"><figcaption>${escapeHtml(screenshot)}</figcaption></figure>`
    ),
    "          </div>"
  ].join("\n");
}

function renderRunArtifacts(): string {
  return [
    '    <section class="section">',
    "      <h2>Run artifacts</h2>",
    '      <ul class="artifact-list">',
    ...TOP_LEVEL_ARTIFACTS.map((artifact) => renderArtifactLink(artifact, artifact)),
    "      </ul>",
    "    </section>"
  ].join("\n");
}

function renderArtifactLink(path: string, label: string): string {
  return `            <li><a href="${escapeAttribute(path)}">${escapeHtml(label)}</a></li>`;
}

function renderMeta(label: string, value: string): string {
  return `        <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function formatRunTitle(report: RunReport): string {
  switch (report.runType) {
    case "feature_verification":
      return `Possum Feature Verification ${report.runId}`;
    case "app_verification":
      return `Possum App Verification ${report.runId}`;
    case "audit":
      return `Possum Audit ${report.runId}`;
  }
}

function formatRunType(runType: RunReport["runType"]): string {
  return runType.replace(/_/g, " ");
}

function formatDiagnosticPhase(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const CSS = `
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f6f7fb;
  color: #172033;
}
* { box-sizing: border-box; }
body { margin: 0; }
a { color: #1d4ed8; }
.shell { width: min(1120px, 100%); margin: 0 auto; padding: 32px 20px 56px; }
.hero, .section, .finding-card {
  background: #fff;
  border: 1px solid #d9deea;
  border-radius: 16px;
  box-shadow: 0 10px 24px rgba(17, 24, 39, 0.06);
}
.hero { padding: 28px; margin-bottom: 20px; }
.section { padding: 24px; margin-top: 20px; }
.eyebrow { margin: 0 0 8px; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; color: #64748b; font-weight: 700; }
h1, h2, h3, h4 { margin-top: 0; color: #0f172a; }
h1 { margin-bottom: 16px; font-size: clamp(30px, 4vw, 48px); line-height: 1.05; }
h2 { font-size: 24px; }
h3 { font-size: 19px; margin-bottom: 8px; }
h4 { margin: 18px 0 8px; }
.status { display: inline-flex; padding: 8px 12px; border-radius: 999px; font-weight: 700; margin: 0 0 20px; }
.status-ok { background: #dcfce7; color: #166534; }
.status-fail { background: #fee2e2; color: #991b1b; }
.metadata, .finding-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 0; }
dt { color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
dd { margin: 4px 0 0; overflow-wrap: anywhere; }
.findings { display: grid; gap: 16px; }
.finding-card { padding: 20px; }
.finding-heading { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
.badges { display: flex; flex-wrap: wrap; gap: 8px; }
.badge { border: 1px solid #cbd5e1; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; background: #f8fafc; }
.severity-high, .severity-critical { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
.severity-medium { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }
.severity-low { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
pre { padding: 12px; overflow-x: auto; border-radius: 10px; background: #0f172a; color: #e2e8f0; }
.artifact-list { display: flex; flex-wrap: wrap; gap: 8px 16px; padding-left: 18px; }
.diagnostics { margin-bottom: 0; }
.empty { color: #475569; }
.screenshots { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
figure { margin: 0; }
img { display: block; max-width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; }
figcaption { margin-top: 6px; color: #64748b; font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .shell { padding: 18px 12px 36px; }
  .hero, .section, .finding-card { border-radius: 12px; padding: 16px; }
}
`;
