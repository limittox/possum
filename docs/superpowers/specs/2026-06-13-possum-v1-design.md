# Possum v1 Design

**Date:** 2026-06-13
**Status:** Approved direction - design spec v1.
**Supersedes:** [2026-06-13-possum-differentiator-brainstorm.md](2026-06-13-possum-differentiator-brainstorm.md)

---

## 1. What Possum Is

> **Can a real customer understand and use the app your coding agent just built?**

Possum is the open-source local customer simulator for AI-built web apps. It runs
against a local app, reads what the app claims to do, sends simulated customers
through the product in a sandboxed browser, and emits reproducible evidence a
coding agent can fix.

Possum's core is local, inspectable, and auditable: browser execution, persona
prompts, sandbox rules, finding judge, repro generation, and report format all
belong in the open-source distribution.

**What Possum is not:**

- Not a coding agent. It never edits code; it finds problems and hands them to
  the coding agent a developer already uses.
- Not a test-case generator. It does not write a durable regression suite into
  the app; it uses the app the way customers do.
- Not a QA platform. There is no required SaaS dashboard, account, or test
  management workflow. Findings are plain files in the repo.
- Not a security scanner. The hostile persona reports robustness failures and
  suspicious behavior, but Possum does not claim security audit coverage.

**Audience:** developers shipping web apps with AI coding tools, especially solo
developers and small teams without a dedicated QA function. They live in the
terminal; Possum meets them there.

## 2. Decisions Log

| Decision | Choice | Why |
|---|---|---|
| Product identity | Open-source local customer simulator | Avoids the crowded AI QA platform frame and makes the differentiator concrete: customers, claims, and reproducible failures. |
| License | Apache-2.0 | Maximizes adoption, permissive use, patent clarity, and enterprise comfort. |
| Core surface | Open source | The trust story depends on developers being able to inspect persona prompts, sandboxing, judging, repros, and report formats. |
| Coding-agent relationship | Tight post-task integration | Claude Code, Codex, and similar agents should be able to call Possum automatically after user-facing work, consume findings, fix issues, and replay repros. |
| Paid surface | Optional hosted acceleration | Hosted parallel runs, team history, model proxying, scheduled audits, managed browsers, and private app connectors can be commercial without compromising local use. |
| v1 command | `possum audit` | Clear one-shot local customer simulation against localhost. Avoids internal implementation jargon in the user-facing command. |
| Customer model | Beginner, impatient, hostile, returning | The cast is the product. Returning user is experimental in v1 because state seeding is the most complex part. |
| Claim source | README, homepage, product copy, and discovered UI | Possum tests claim-vs-reality: what the app says users can do versus what customers can actually complete. |
| Output | Plain files under `.possum/runs/<id>` | Auditable, git-friendly, agent-friendly evidence instead of a proprietary database. |
| Sandbox | Lightweight local browser/app isolation | Local-first adoption and fast startup. v1 must state isolation limits plainly and recommend trusted projects only. |
| Models | BYO keys for v1 | Keeps Possum usable without an account while allowing paid model proxying later. |

## 3. Product Surface

### `possum audit`

Runs a local one-shot customer simulation against a target app, usually
`localhost`.

Flow:

1. **Launch:** start the app from a configured command or connect to an existing
   localhost URL.
2. **Discover:** crawl reachable routes, forms, calls to action, and app copy.
3. **Extract claims:** read README, homepage, and product text to infer what the
   app says users can do.
4. **Simulate customers:** run personas in isolated browser contexts with their
   own cookies and storage.
5. **Record traces:** log every action, screenshot, DOM snapshot, and candidate
   finding.
6. **Judge findings:** replay candidate failures, require reproducibility, dedupe
   related issues, rank severity, and suppress known false positives.
7. **Report:** write local evidence to `.possum/runs/<id>`.

### `possum report`

Renders findings from `.possum/runs/<id>` into Markdown or another local output
format without rerunning the audit.

### `possum replay <finding>`

Reruns the generated Playwright repro for a finding. This is the fix-verification
loop: a coding agent claims a fix, then Possum checks whether the customer
failure still reproduces.

## 4. Coding Agent Integration

Possum should be a verification layer that coding agents can invoke when they
finish work. The manual CLI remains the baseline, but the product should be
designed so Claude Code, Codex, Cursor, and similar tools can decide to run
persona-based testing without a human explicitly typing `possum audit`.

### Automatic Post-Task Trigger

A coding agent should consider running Possum after it completes a task when the
change affects:

- onboarding, signup, checkout, invite, settings, or other customer workflows
- forms, validation, permissions, state, sessions, or navigation
- homepage, README, product copy, or claims about what users can do
- flows that are hard to cover with unit tests alone
- AI-generated prototypes where first-run usability is uncertain

It should usually skip Possum for:

- internal refactors with no behavior change
- dependency or formatting-only changes
- backend-only changes with no reachable customer path
- tasks where faster deterministic tests already prove the relevant behavior

### Agent Loop

The intended loop is:

1. Agent implements the requested change.
2. Agent runs normal project verification first.
3. Agent decides whether persona-based testing adds signal.
4. Agent runs `possum audit` against the local app when useful.
5. Agent reads `.possum/runs/<id>/report.md` and finding files.
6. Agent fixes relevant findings.
7. Agent runs `possum replay <finding>` to verify the original customer failure.
8. Agent reports both normal verification and Possum evidence to the user.

### MCP Surface

The v1 design should include an MCP server so coding agents can call Possum
directly:

- `run_audit`: run a local audit against a configured target or localhost URL
- `list_findings`: list findings for a run
- `get_finding`: return a self-contained finding packet
- `replay_finding`: rerun a finding repro
- `get_report`: return the run report

The MCP surface should return paths and structured data, not opaque hosted
links. The agent should be able to inspect the same files a human can inspect.

### Handoff Packets

Every finding should be convertible into an agent-ready packet containing:

- finding summary
- expected and actual behavior
- persona and mission
- relevant screenshots and trace paths
- generated Playwright repro
- suggested verification command
- app claims or product copy that motivated the mission

The packet is not a fix recommendation engine. Its job is to give the coding
agent enough auditable context to repair the issue and verify the repair.

## 5. Open-Source Core

The open-source repository should include the real execution path, not a thin
client around a proprietary service:

- local browser execution and Playwright driver
- persona prompts and behavior policies
- sandbox rules and default restrictions
- claim extraction and surface map format
- finding judge and reproducibility rules
- repro generation
- finding schema
- report format
- fixture apps and benchmark corpus
- public extension points for persona packs and fixtures

This is the defensible trust claim: a developer can inspect why Possum decided a
customer failed, rerun the evidence, and modify the personas or fixtures without
asking a hosted service for permission.

## 6. Personas

Each persona is a system prompt, behavior policy, and finding rubric. Personas
explore behavior space the way customers do instead of fuzzing blind input space.

### Beginner

Lands on the app knowing nothing. Tries to accomplish what the README, homepage,
or product copy says the app offers. Never uses developer knowledge, never reads
source code, and never infers around a broken step.

**Finds:** broken onboarding, dead ends, silently failing forms, confusing
navigation, missing first-run state, and docs/claims drift.

### Impatient

Double-clicks submit, hits back mid-flow, refreshes during saves, abandons and
retries forms, and opens the same page in multiple tabs.

**Finds:** duplicate submissions, corrupted state, lost form data, race
conditions, non-idempotent operations, and fragile loading states.

### Hostile

Uses injection-shaped strings, oversized inputs, URL tampering, unexpected
Unicode, and awkward boundary values.

**Finds:** validation gaps, unhandled errors, XSS-shaped output handling,
information leaks in error pages, and unsafe form behavior.

### Returning

Starts with stale state: old localStorage, expired sessions, an existing account
mid-flow, or artifacts from a previous app version.

**Finds:** session-handling bugs, migration breaks, stale-cache failures, and
"works in incognito" failure classes.

**v1 status:** experimental. Ship if feasible, but cut before weakening the first
three personas.

## 7. Evidence Format

Possum writes plain files:

```text
.possum/
  surface.yaml
  runs/
    <run-id>/
      report.md
      findings.json
      personas/
        <persona-id>/
          trace.json
          screenshots/
      findings/
        <finding-id>/
          report.md
          repro.spec.ts
          trace.json
          screenshots/
```

Finding records must include:

- stable finding ID
- persona
- claim or user mission being attempted
- expected behavior
- actual behavior
- severity and confidence
- reproducibility status
- repro command
- screenshot and trace references
- dedupe fingerprint

Reports should be written for two readers: a human developer scanning the failure
and a coding agent receiving a self-contained repair packet.

## 8. Extension Points

Open extension surfaces are part of the product, not afterthoughts:

- **Persona packs:** additional customer types with prompts, policies, and
  finding rubrics.
- **Finding schema:** documented JSON schema for custom reporters and agent
  integrations.
- **Fixture apps:** intentionally broken apps that demonstrate and regression
  test known failure classes.
- **Benchmark corpus:** the public "Possum customer audit corpus" used to track
  releases, false positives, and regressions.

## 9. Fixture And Proof Plan

v1 should ship fixture apps for:

- broken onboarding or docs-drifted first run
- double-submit checkout
- unsafe or unvalidated form
- stale-session or stale-storage failure

Each release must run the fixture suite and prove:

- known fixture findings are caught
- known false positives are suppressed
- generated repros still execute
- report schema remains compatible

Public examples should show Possum catching failures in real AI-generated apps.
The benchmark should be published as the Possum customer audit corpus.

## 10. Competitive Positioning

Competitors such as TestSprite CLI, Momentic, QA Wolf, Octomind, Bug0/Passmark,
Browser Use, Stagehand, Playwright MCP, and Skyvern crowd the "AI testing" and
"browser automation" space. Possum should not fight them on "test coverage,"
"self-healing tests," or "QA platform" language.

| Dimension | Crowded AI QA framing | Possum framing |
|---|---|---|
| Primary question | Did we generate enough tests? | Could a customer use the app? |
| Home | Cloud-first dashboard | Local terminal and plain files |
| Model | Regression suite generation | Persona-driven product failure discovery |
| Source of truth | Test management workflow | README/homepage claims versus reality |
| Evidence | Hosted ticket, video, or dashboard | Screenshots, traces, and Playwright repros in repo |
| Developer loop | Separate QA workflow | Agent-ready failure packets and local replay |

Language discipline is strategic. Possum should say:

- "The beginner customer could not finish onboarding."
- "The impatient customer submitted the order twice."
- "The app claims teams can invite members, but no customer found a working path."

Possum should avoid:

- "Increase test coverage."
- "Generate self-healing tests."
- "Autonomous QA platform."
- "End-to-end test management."

## 11. Commercial Boundary

The commercial product can make Possum faster, easier to share, or easier to run
at team scale, but should not be required for the core local audit.

Good paid surfaces:

- hosted parallel audits
- team run history
- scheduled audits
- managed browsers
- model proxying and cost controls
- private app connectors
- organization policy controls

Bad paid surfaces:

- hiding persona prompts
- hiding the finding judge
- requiring an account for local audits
- locking report formats behind a service
- making repro execution proprietary

## 12. Risks

1. **Crowded category:** the product loses its edge if it drifts into generic AI
   testing language.
2. **App launch complexity:** local apps vary wildly. Possum should show what it
   tried, ask for a run command, and stop instead of guessing forever.
3. **Browser-agent flakiness:** suppress low-confidence findings through replay,
   dedupe, and false-positive fixtures.
4. **Cost per run:** bounded exploration and BYO keys are required for v1.
5. **Sandbox limits:** lightweight local isolation is useful but not a VM-grade
   security boundary. Documentation must be explicit.
6. **Returning-user complexity:** state seeding can slip without weakening the
   rest of v1.

## 13. Out Of Scope For v1

- required hosted account
- cloud-only audit execution
- QA dashboards and test-management workflows
- durable regression suite generation as the primary product
- native desktop or mobile app testing
- full security audit claims
- multi-user collaborative simulations
- CI product as the core launch surface

## 14. Implementation Open Questions

- Implementation language and Playwright integration shape.
- `possum.toml` schema for target URL, run command, seed credentials, route
  scoping, budgets, and model configuration.
- Finding ID and dedupe fingerprint scheme.
- Exact report Markdown and `findings.json` schemas.
- Repro-generation contract for `possum replay <finding>`.
- MCP tool contract for coding-agent initiated audits.
- Agent trigger guidance for when persona-based testing is worth the cost.
- Initial benchmark corpus layout and release gate commands.
