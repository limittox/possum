# HTML Run Report Design

Date: 2026-06-28

## Goal

Generate a static per-run HTML report so developers and coding agents can inspect Possum findings, screenshots, repro commands, and debugging artifacts in a browser without running a dashboard server.

## Background

Possum currently writes plain-file run artifacts under `.possum/runs/<runId>/`, including:

- `findings.json`
- `report.md`
- `verification.json` for feature and diff verification runs
- `surface.json` for app/audit runs
- per-finding artifacts under `findings/<findingId>/`
- per-finding `debug.json` and `repair-hints.md`

The Markdown report is compact and script-friendly, but it is not ideal for humans reviewing screenshots and artifact links. A static HTML report improves local inspection and CI artifact review while keeping Possum simple and local-first.

## Decision

Implement **static per-run `report.html`** as the MVP.

Every call to `writeRunReport()` will write:

```txt
.possum/runs/<runId>/report.html
```

The report is self-contained HTML with embedded CSS and relative links to existing run artifacts. It does not require a local server, JavaScript, external assets, telemetry, or remote network access.

## Non-Goals

This MVP does not include:

- a multi-run dashboard command
- report history browsing
- charts or trend analysis
- live updates while a run is in progress
- artifact bundling into a single file
- visual diffing
- editing or rerunning findings from the report UI

These can be added later on top of stable per-run HTML artifacts.

## User Experience

After any audit or verification run, the run directory contains both Markdown and HTML reports:

```txt
.possum/runs/run_20260628_120000/
  findings.json
  report.md
  report.html
  playwright.config.ts
```

CLI commands that already print a Markdown report path should also print:

```txt
HTML Report: .possum/runs/<runId>/report.html
```

This applies to:

- `possum audit`
- `possum verify-app`
- `possum verify-feature`
- `possum verify-diff`

MCP structured responses for run-producing tools should include `reportHtmlPath` so agents can surface it as an artifact link.

## Report Content

`report.html` should include these sections.

### Header

- Possum run title based on `runType`
- run id
- target URL
- started/completed timestamps
- personas
- finding count
- run status summary:
  - “No confirmed findings” when there are none
  - “N confirmed finding(s)” when findings exist

### Diagnostics

If `report.diagnostics` exists, render each diagnostic with phase, status, and reason.

Example:

```txt
Claims: inconclusive — provider timed out
```

### Findings

Render each finding as a card containing:

- finding id
- persona
- severity
- confidence
- mission
- expected behavior
- actual behavior
- reproducibility status and attempts
- artifact links:
  - per-finding `report.md`
  - `trace.json`
  - `debug.json`
  - `repair-hints.md`
  - `repro.spec.ts`
- repro command:

```bash
npx playwright test findings/<findingId>/repro.spec.ts
```

If finding evidence includes screenshot paths, render each as an inline image with a relative path and safe alt text. Broken image links should not break the report.

### Run Artifacts

Render links to top-level artifacts when they are expected to exist:

- `findings.json`
- `report.md`
- `surface.json`
- `verification.json`
- `diff-brief.json`
- `playwright.config.ts`

The MVP renders this fixed known list as relative artifact links. Static HTML should tolerate missing optional files because not every run type has every artifact.

## Architecture

### New module: `src/report/renderHtml.ts`

Responsibilities:

- Render a `RunReport` into a complete HTML string.
- Escape all user-controlled text.
- Generate relative links from existing `Finding.evidence` paths.
- Render screenshots from `Finding.evidence.screenshots`.
- Keep CSS embedded and minimal.

Proposed interface:

```ts
export function renderRunHtml(report: RunReport): string;
```

Optional helper functions can remain private:

- `escapeHtml(value: string): string`
- `formatRunTitle(report: RunReport): string`
- `renderFindingCard(finding: Finding): string`
- `renderArtifactLink(path: string, label: string): string`

### Modify `src/runs/runStore.ts`

`writeRunReport()` should:

1. Parse the report with `RunReportSchema`.
2. Write existing artifacts as today.
3. Write `report.html` using `renderRunHtml(parsed)`.
4. Return a new `reportHtmlPath` field in `WrittenRun`.

Existing callers can ignore `reportHtmlPath` until they are updated to print or return it.

### CLI output

Update CLI run result printing to include HTML report path where the result includes it.

The implementation should preserve existing stdout lines and add the new line after `Report:`:

```txt
Report: /path/to/report.md
HTML Report: /path/to/report.html
```

### MCP output

MCP tool structured content should include `reportHtmlPath` for run-producing tools when available:

- `run_audit`
- `verify_app`
- `verify_feature`
- `verify_diff`

The text message can remain concise.

## Security and Safety

- Escape every string from app content, findings, diagnostics, target URLs, artifact paths, and run metadata.
- Do not embed raw JSON into executable JavaScript.
- Do not include external CSS, fonts, scripts, or image URLs generated from remote data.
- Artifact links should be relative file paths only.
- Auth storage state under `.possum/auth/` must never be linked or rendered.
- The HTML report should not copy cookies, headers, local storage, or secrets.

## Styling

Use embedded CSS only. The default style should prioritize readability over visual polish:

- centered content with max width
- clear summary cards
- severity badges
- monospace blocks for commands and ids
- responsive layout for narrow screens
- visible borders and high contrast colors

No JavaScript is required for the MVP.

## Testing Strategy

Add tests that verify:

1. `renderRunHtml()` escapes unsafe content from finding fields and target URL.
2. `renderRunHtml()` includes run summary, diagnostics, artifact links, repro command, and screenshot image tags.
3. `writeRunReport()` writes `report.html` and returns `reportHtmlPath`.
4. CLI commands print `HTML Report:` when run-producing implementations return `reportHtmlPath`.
5. MCP structured responses include `reportHtmlPath` for run-producing tools.

Run full verification before completion:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

## Migration and Compatibility

This is backward-compatible:

- Existing `report.md` stays unchanged.
- Existing `findings.json` stays unchanged.
- Existing callers that ignore the new `reportHtmlPath` return field continue to work.
- Existing run directories without `report.html` remain readable.

## Future Extensions

After the MVP, Possum can add:

- `possum open <runId>` to open `report.html`
- `possum dashboard` multi-run browser UI
- client-side filtering/search if reports become large
- inline rendering of selected JSON artifacts
- CI-friendly single-file report bundling
- visual comparisons between runs
