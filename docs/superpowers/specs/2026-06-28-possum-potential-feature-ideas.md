# Possum Potential Feature Ideas

Date: 2026-06-28

## Context

Possum has pivoted toward browser-based app verification for coding agents. It already supports:

- `verify-app` for broader local app verification.
- `verify-feature --brief feature.json` for feature-specific verification.
- MCP tools for agent integration.
- Persona-based browser probes.
- Claim-vs-reality verification with LLMs.
- Plain-file run artifacts under `.possum/runs/<runId>`.
- Screenshots, traces, findings JSON/Markdown, and repro specs.

This document records possible future features inspired by adjacent products in AI E2E testing, browser-agent automation, synthetic monitoring, visual regression, and accessibility testing.

## Research References

Adjacent products and capabilities reviewed:

- Momentic: natural-language tests stored in repo, local/CI execution, videos/traces/local reports, AI actions, auto-healing locators.
  - https://docs.momentic.ai/
- Browserbase / Stagehand: browser automation through natural-language `act` and structured `extract`, with session inspector and model-provider flexibility.
  - https://docs.browserbase.com/welcome/quickstarts/stagehand
- Browserbase observability: session video, live view, CDP events, console logs, network logs, HAR, Playwright traces.
  - https://docs.browserbase.com/platform/browser/observability/observability
- Playwright MCP: browser tools, snapshots, screenshots, network/storage/testing/devtools/vision capabilities.
  - https://playwright.dev/mcp/capabilities
- Checkly: scheduled checks, alert thresholds, retries, escalation policies, alert channels.
  - https://www.checklyhq.com/docs/communicate/alerts/overview/
- Percy: visual regression snapshots, PR review, noise filtering, CI integration.
  - https://www.browserstack.com/docs/percy
- axe-core Playwright: automated accessibility analysis with Playwright.
  - https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/README.md
- Meticulous: session recording, replay, visual/behavioral diffing, network mocking, PR review.
  - https://www.meticulous.ai/how-it-works
- Octomind: AI-assisted E2E generation, persistent traces, visual diffs, self-healing tests, Playwright/Cypress integration.
  - https://octomind.dev/
- QA Wolf / Reflect / Autify / mabl: AI QA, browser tests, managed execution, natural-language authoring.
  - https://www.qawolf.com/
  - https://reflect.run/
  - https://autify.com/products/ai-native-managed-qa
  - https://www.mabl.com/

## Market Patterns

Common patterns across adjacent tools:

1. **Natural-language test authoring**
   - Users describe behavior; tool turns it into reliable browser actions/assertions.

2. **Agent browser primitives**
   - Tools expose browser operations such as navigate, click, type, observe, extract, assert, inspect network, inspect console.

3. **Rich debugging artifacts**
   - Videos, screenshots, traces, network logs, console logs, HARs, DOM snapshots, and step timelines are central to developer experience.

4. **CI and PR integration**
   - Runs attach results to pull requests and block or warn on confirmed regressions.

5. **Visual regression**
   - Tools compare screenshots between baseline and current changes, often with noise filtering.

6. **Accessibility automation**
   - axe-style automated checks catch common accessibility regressions.

7. **Self-healing / durable tests**
   - Many tools focus on reducing brittleness in selectors and long-lived E2E suites.

8. **Session recording and replay**
   - Recording real or developer sessions can generate high-signal flows without writing tests manually.

## Recommended Feature Ideas

### 1. `possum verify-diff`

Infer what changed from git and verify the user-facing behavior automatically.

Example:

```bash
possum verify-diff
```

Inputs could include:

- `git diff`
- changed files and routes
- commit messages
- PR description
- package/framework metadata

Flow:

1. Inspect code changes.
2. Infer likely user-facing behavior.
3. Generate a temporary feature verification brief.
4. Run browser verification.
5. Report passed/failed/inconclusive checks.

Why this matters:

- Strong fit for coding agents.
- Reduces need for humans/agents to write `feature.json` manually.
- Makes Possum feel like an automatic final-check tool after a coding task.

Potential CLI:

```bash
possum verify-diff
possum verify-diff --base main
possum verify-diff --brief-out .possum/generated-feature.json
```

---

### 2. Enhanced Debugging Bundle

For every finding, collect a richer set of repair-focused artifacts.

Artifacts:

- Playwright trace zip.
- Browser console errors/warnings.
- Failed network requests.
- Optional HAR.
- Screenshot before/after key actions.
- DOM or accessibility snapshot.
- Step timeline.
- LLM/browser-agent action log.
- “Likely root cause” summary for coding agents.

Why this matters:

- Possum findings become easier for agents to fix.
- Reduces ambiguity in repros.
- Matches the strongest developer-experience pattern from Browserbase, Octomind, and Playwright tooling.

Potential output:

```txt
.possum/runs/<runId>/findings/<findingId>/
  report.md
  trace.json
  trace.zip
  console.json
  network.json
  screenshots/
  repro.spec.ts
  root-cause.md
```

---

### 3. Accessibility / Keyboard Persona

Add a built-in persona for keyboard and screen-reader-adjacent behavior.

Checks:

- Tab order reaches primary controls.
- Focus is visible.
- Buttons and links have accessible names.
- Forms have labels and useful validation errors.
- Modals trap and release focus correctly.
- Common axe-core violations.

Potential persona name:

```txt
keyboard
```

Potential finding examples:

- `finding_keyboard_focus_trap_001`
- `finding_keyboard_unreachable_cta_001`
- `finding_accessibility_missing_label_001`

Why this matters:

- High product value.
- Relatively concrete to implement.
- Helps Possum catch failures that normal click-based browser checks miss.

---

### 4. Auth / Session Setup Recorder

Many real apps require login. Possum should make authenticated verification easy.

Potential CLI:

```bash
possum auth record
possum auth record --name admin
possum verify-app --auth admin
```

Flow:

1. Open browser.
2. User logs in manually.
3. Save Playwright storage state.
4. Future runs restore that session.

Possible config:

```json
{
  "target": { "url": "http://localhost:3000", "command": "npm run dev" },
  "auth": {
    "default": ".possum/auth/default.json"
  }
}
```

Security notes:

- Auth state should not be committed by default.
- `possum init` should ignore `.possum/auth/` if this feature is added.
- Reports should redact cookies/tokens.

---

### 5. Visual Customer Regression

Add lightweight visual regression for customer-facing breakage.

Potential CLI:

```bash
possum verify-app --baseline main
possum visual compare --baseline run_... --current run_...
```

Scope should stay focused on obvious customer-impacting regressions, not full design-review replacement.

Catch examples:

- Missing images.
- Blank page sections.
- Text color/background contrast disasters.
- Offscreen or hidden CTA.
- Broken mobile layout.
- Overlapping content.

Why this matters:

- Complements functional/persona verification.
- Gives agents visual evidence.
- Differentiates Possum from pure Playwright test generation.

---

### 6. Claim Inventory / Truth Ledger

Possum already extracts and verifies claims. A claim ledger would track claim status over time.

Potential CLI:

```bash
possum claims
possum claims --json
```

Example output:

```txt
✓ “Export reports as PDF” verified in run_20260628_120000
✗ “Invite teammates” failed in run_20260628_121500
? “Works offline” inconclusive — provider timed out
```

Why this matters:

- Turns Possum into a product-truth tool.
- Helps teams keep marketing/docs aligned with shipped behavior.
- Makes claim verification results easier to review across runs.

Potential storage:

```txt
.possum/claims/index.json
```

---

### 7. GitHub Action and PR Comment

Add official CI workflow support and PR summaries.

Potential usage:

```yaml
- run: npx possum verify-app
```

PR comment example:

```md
## Possum Verification

No confirmed findings.

Diagnostics:
- Claims: inconclusive — OpenRouter request timed out

Report: .possum/runs/run_.../report.md
```

Why this matters:

- Makes Possum usable as an agent PR gate.
- Helps humans review agent-generated changes.
- Aligns with Checkly/CI/PR feedback patterns.

Possible package surfaces:

- `possum github-comment`
- GitHub Action wrapper.
- `--report-format github-markdown`

---

### 8. Repro Minimizer

Generated repros are useful, but could be simplified automatically.

Potential CLI:

```bash
possum minimize findings/<findingId>/repro.spec.ts
```

Goal:

- Keep only the steps needed to reproduce failure.
- Remove redundant navigation/actions.
- Emit a cleaner Playwright spec for coding agents and humans.

Why this matters:

- Better repair loop.
- Easier regression-test promotion.
- More trustworthy artifacts.

---

### 9. Export Durable Tests

Let teams convert useful Possum checks/findings into permanent Playwright tests.

Potential CLI:

```bash
possum export-test run_... check_2
possum export-test findings/finding_beginner_dead_end_001/repro.spec.ts --out tests/e2e/
```

Why this matters:

- Bridges exploratory verification and long-term regression coverage.
- Gives users a way to preserve important learnings.
- Keeps Possum from becoming only ephemeral audit output.

---

### 10. Configurable Persona Packs

Let projects choose built-in or domain-specific persona sets.

Potential config:

```json
{
  "personas": ["beginner", "impatient", "hostile", "keyboard", "mobile", "returning"]
}
```

Possible packs:

- `marketing-site`
- `saas-dashboard`
- `ecommerce`
- `auth-heavy-app`
- `mobile-first`
- `accessibility`

Why this matters:

- Keeps default Possum simple.
- Allows richer domain-specific verification.
- Makes future personas easier to introduce without bloating every run.

---

### 11. Mobile / Responsive Persona

Simulate a mobile customer.

Checks:

- Viewport-specific nav/menu usability.
- Touch target size.
- No horizontal overflow.
- Primary CTA visible without awkward scrolling.
- Forms usable on mobile viewport.

Potential CLI:

```bash
possum verify-app --persona mobile
```

Why this matters:

- Many local app regressions are responsive layout failures.
- Pairs well with visual customer regression.

---

### 12. Network and Offline Persona

Use browser network controls to test degraded states.

Checks:

- Offline mode surfaces useful message.
- Failed API calls show recoverable errors.
- Slow network does not create duplicate submissions.
- Loading states are visible and eventually resolve or fail gracefully.

Potential CLI/config:

```json
{
  "personas": ["network-degraded"]
}
```

Why this matters:

- Extends hostile/impatient testing into realistic runtime failure modes.
- Playwright already supports network interception and offline state.

## Suggested Prioritization

### Highest leverage

1. `possum verify-diff`
2. Enhanced debugging bundle
3. Accessibility / keyboard persona

### Next tier

4. Auth/session setup recorder
5. GitHub Action / PR comment
6. Visual customer regression

### Later / strategic

7. Claim inventory / truth ledger
8. Export durable tests
9. Configurable persona packs
10. Repro minimizer
11. Mobile persona
12. Network/offline persona

## Recommended Sequencing

A practical order:

1. **Enhanced debugging bundle**
   - Improves every current finding.
   - Low product ambiguity.
   - Strengthens agent repair loop.

2. **Accessibility / keyboard persona**
   - Adds concrete new verification value.
   - Can be deterministic with axe-core plus keyboard probes.

3. **`verify-diff`**
   - Highest strategic value, but needs careful design.
   - Should build on stable feature verification and richer artifacts.

4. **Auth/session setup recorder**
   - Unlocks real SaaS/dashboard apps.
   - Also supports all later features.

5. **GitHub Action / PR comment**
   - Makes Possum visible in the development workflow.

## Product Principle

Possum should not become a generic QA management suite. Its strongest position is:

> A local, agent-friendly browser verifier that tells coding agents whether the app they just changed actually works for customers, with evidence they can fix.

Future features should reinforce:

- Local-first execution.
- Plain-file artifacts.
- Coding-agent repair loops.
- Customer-impact focus.
- Reproducible evidence over abstract coverage.
