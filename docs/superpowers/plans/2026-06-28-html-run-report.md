# HTML Run Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a static `report.html` for every Possum run and expose the path through CLI and MCP run-producing workflows.

**Architecture:** Add a focused HTML renderer beside the existing Markdown renderer, call it from `writeRunReport()`, and thread the returned `reportHtmlPath` through run result types, CLI output, and MCP structured content. Keep the MVP static, no-JS, no external assets, and preserve all existing Markdown/JSON artifacts.

**Tech Stack:** TypeScript, Node.js file writes, existing RunReport contracts, Vitest.

## Global Constraints

- Work inline in `/home/yathu/code/possum`; do not create a worktree.
- Use TDD: no production behavior change without a failing test first.
- Keep `.headroom/` and `AGENTS.md` untouched.
- The HTML report must be static, self-contained, no JavaScript, no external CSS/fonts/assets, and no telemetry.
- Escape every string from app content, findings, diagnostics, target URLs, artifact paths, and run metadata.
- Do not render or link auth storage state under `.possum/auth/`.
- Existing `report.md` and `findings.json` behavior must remain compatible.

---

## File Structure

- Create `src/report/renderHtml.ts`
  - Pure renderer: `renderRunHtml(report: RunReport): string`.
  - Private escaping and section helpers.

- Modify `src/runs/runStore.ts`
  - Import HTML renderer.
  - Write `report.html` in `writeRunReport()`.
  - Add `reportHtmlPath` to `WrittenRun`.

- Modify result types and callers:
  - `src/audit/audit.ts` adds `reportHtmlPath` to `AuditResult` return.
  - `src/verification/featureVerification.ts` adds `reportHtmlPath` to `FeatureVerificationResult` return.
  - Existing `verifyApp` inherits `AuditResult`.

- Modify integration surfaces:
  - `src/cli/main.ts` prints `HTML Report:` for run-producing commands.
  - `src/mcp/server.ts` includes `reportHtmlPath` in structured content for run-producing tools.

- Tests:
  - Create `tests/renderHtml.test.ts`.
  - Extend `tests/runStore.test.ts`.
  - Extend `tests/cli.test.ts`.
  - Extend `tests/mcpHandlers.test.ts`.

---

### Task 1: HTML Renderer

**Files:**
- Create: `src/report/renderHtml.ts`
- Create: `tests/renderHtml.test.ts`

**Interfaces:**
- Produces: `renderRunHtml(report: RunReport): string`
- Consumes: `RunReport` and `Finding` from `src/contracts/findings.ts`

**Steps:**
- [ ] Write failing renderer test for summary, diagnostics, finding card, artifact links, repro command, and screenshot `<img>`.
- [ ] Write failing renderer test proving unsafe text is escaped and not emitted raw.
- [ ] Run `npm test -- tests/renderHtml.test.ts` and confirm failures.
- [ ] Implement minimal `renderRunHtml()` with embedded CSS and escaped content.
- [ ] Run `npm test -- tests/renderHtml.test.ts` and confirm pass.
- [ ] Commit renderer and tests.

---

### Task 2: Run Store Writes `report.html`

**Files:**
- Modify: `src/runs/runStore.ts`
- Modify: `tests/runStore.test.ts`

**Interfaces:**
- `WrittenRun` gains `reportHtmlPath: string`.
- `writeRunReport()` writes `report.html` next to `report.md`.

**Steps:**
- [ ] Add failing run store test expecting `written.reportHtmlPath` and `report.html` contents.
- [ ] Run `npm test -- tests/runStore.test.ts` and confirm failure.
- [ ] Implement HTML write in `writeRunReport()`.
- [ ] Run `npm test -- tests/runStore.test.ts tests/renderHtml.test.ts` and confirm pass.
- [ ] Commit run store integration.

---

### Task 3: Thread Result Types and CLI Output

**Files:**
- Modify: `src/audit/audit.ts`
- Modify: `src/verification/featureVerification.ts`
- Modify: `src/cli/main.ts`
- Modify: `tests/cli.test.ts`

**Interfaces:**
- `AuditResult` includes `reportHtmlPath`.
- `FeatureVerificationResult` includes `reportHtmlPath`.
- CLI prints `HTML Report: <path>` after `Report: <report.md>` for:
  - `audit`
  - `verify-app`
  - `verify-feature`
  - `verify-diff`

**Steps:**
- [ ] Add failing CLI tests using injected implementations that return `reportHtmlPath`.
- [ ] Run focused CLI tests and confirm failure.
- [ ] Thread `written.reportHtmlPath` through audit and feature verification results.
- [ ] Update CLI output helper or explicit stdout lines.
- [ ] Update existing injected test result objects that now need `reportHtmlPath`.
- [ ] Run `npm test -- tests/cli.test.ts tests/auditProbe.test.ts tests/featureVerification.test.ts` and confirm pass.
- [ ] Commit CLI and result type integration.

---

### Task 4: MCP Structured Content

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `tests/mcpHandlers.test.ts`

**Interfaces:**
- MCP structured content includes `reportHtmlPath` for:
  - `run_audit`
  - `verify_app`
  - `verify_feature`
  - `verify_diff`

**Steps:**
- [ ] Add failing MCP tests expecting `reportHtmlPath` in structured content.
- [ ] Run `npm test -- tests/mcpHandlers.test.ts -t "reportHtmlPath"` and confirm failure.
- [ ] Add `reportHtmlPath` to MCP structured responses.
- [ ] Update injected implementation fixtures to return `reportHtmlPath`.
- [ ] Run `npm test -- tests/mcpHandlers.test.ts tests/mcp.test.ts` and confirm pass.
- [ ] Commit MCP integration.

---

### Task 5: README and Full Verification

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] Document `report.html` under run artifacts / debugging artifacts.
- [ ] Run full verification:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `git diff --check`
- [ ] Commit docs.
- [ ] Report verification evidence and final status.
