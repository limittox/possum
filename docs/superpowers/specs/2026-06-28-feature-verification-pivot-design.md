# Feature verification pivot — design

**Date:** 2026-06-28
**Status:** Approved (brainstorming)
**Topic:** Pivot Possum from narrow app audit / claim-vs-reality into browser-based app verification for coding agents.

## Problem

Possum currently presents itself as a local customer audit tool with an optional claim-vs-reality phase. That is useful, but too narrow for the highest-value coding-agent workflow.

The common agent workflow is:

1. A coding agent finishes a feature.
2. The agent knows what it intended to build.
3. The agent wants an independent browser-level check that the feature actually works on specific pages and workflows.
4. If the feature fails, the agent needs evidence, trace, and repro artifacts it can act on.

Claim-vs-reality is one example of this broader need: it turns app claims into expected behaviors and checks whether the app satisfies them. The product direction should widen from "does the app satisfy its claims?" to "does the app work as intended from the outside, like a user?"

## Product direction

Possum becomes:

> Browser-based app verification for coding agents.

The primary concepts become:

- **Feature verification** — targeted verification of a completed feature from a coding-agent brief.
- **App verification** — whole-app verification that combines deterministic baseline probes, explicit checks, discovered checks, and claim-derived checks.
- **Audit** — retained as a backwards-compatible alias for app verification.

## Goals

- Add a new **LLM-driven `verify-feature` workflow** for coding agents.
- Introduce shared verification concepts that can power both `verify-feature` and future full `verify-app` behavior.
- Keep current deterministic audit behavior available through `verify-app` and `audit`.
- Let agents provide explicit checks, while Possum can infer supplementary or missing checks from the feature brief.
- Clearly mark every check as `explicit` or `inferred`.
- Support setup/auth instructions as a separate setup phase.
- Let the LLM verifier navigate within a check-bounded, same-origin scope so it can handle complex pages.
- Return per-check `passed`, `failed`, or `inconclusive` results.
- Create normal Possum finding artifacts for failed checks while keeping passed and inconclusive checks in the verification summary.

## Non-goals for the first implementation slice

- Replacing the current deterministic beginner/impatient/hostile probes.
- Fully rebuilding whole-app verification in one pass.
- Removing or breaking `possum audit` or MCP `run_audit`.
- Deterministic execution from hints. Hints guide the LLM verifier; they do not force a non-LLM runner in this slice.
- Database, API, filesystem, or source-code assertions. Verification remains browser-visible behavior.
- Credential storage or secret management. Setup instructions may describe how to log in using app-provided demo flows, but Possum will not introduce a credential vault.
- Cross-origin browsing. The verifier may navigate same-origin routes only.

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| First shipped workflow | `verify-feature` | Directly serves the coding-agent "I finished this feature; verify it" workflow. |
| App-level pivot | Add `verify-app`; keep `audit` as alias | Establishes new product language without breaking existing users. |
| Architecture | New shared verification core plus wrappers | Avoids tangling feature verification into claim-specific code. |
| Execution | LLM-driven browser verifier | Handles complex real pages better than purely deterministic hint execution. |
| Check source | Hybrid explicit + inferred | Agents can be precise, while Possum can fill gaps and mark trust boundaries. |
| Navigation scope | Check-bounded, same-origin | Flexible enough for multi-page features while preventing unrelated browsing. |
| Setup/auth | Separate setup phase | Setup failure means checks are inconclusive, not automatically failed. |
| Artifacts | Reuse `.possum/runs/<runId>` with `runType` | Keeps one artifact model while distinguishing workflow type. |
| Failed checks | Also create normal findings | Coding agents get existing trace/repro/report workflow for failures. |
| Inconclusive checks | Summary only, no finding | Infrastructure/setup ambiguity is not evidence the app is broken. |

## First implementation slice

Build the shared verification foundation and ship:

1. **`verify-feature`** — new LLM-driven feature verification workflow.
2. **`verify-app`** — new primary app-verification name that initially wraps current `runAudit` behavior.
3. **`audit` / `run_audit`** — compatibility aliases that keep current behavior.

The first slice intentionally does not implement the full future `verify-app` planner. It prepares the architecture and delivers targeted feature verification first.

## Verification brief

A feature verification request is a JSON-compatible brief.

```json
{
  "feature": "Added CSV export to reports",
  "pages": ["/reports"],
  "setup": ["Log in as the demo user", "Open the Reports page"],
  "checks": [
    {
      "text": "Click Export CSV and confirm a CSV downloads",
      "hints": {
        "page": "/reports",
        "clickText": "Export CSV",
        "expectedDownload": ".csv"
      }
    }
  ]
}
```

### Brief fields

- `feature: string` — required. Human-readable description of the completed feature.
- `pages: string[]` — optional but recommended. Routes or absolute same-origin URLs the verifier should start from or prioritize.
- `setup: string[]` — optional. Ordered natural-language setup/auth steps.
- `checks: FeatureCheckBrief[]` — optional. Explicit acceptance checks.

### Check fields

- `text: string` — required for explicit checks.
- `hints?: Record<string, unknown>` — optional guidance for the verifier. Initial supported hint names are intentionally broad:
  - `page`
  - `clickText`
  - `fill`
  - `expectedText`
  - `expectedDownload`
  - `expectedNavigation`
  - `notes`

Hints are prompt context for the LLM verifier, not a deterministic DSL.

## Check normalization and inference

Possum normalizes all checks into:

```ts
interface VerificationCheck {
  id: string;
  source: "explicit" | "inferred";
  text: string;
  pages: string[];
  hints?: Record<string, unknown>;
}
```

Rules:

- Explicit checks keep `source: "explicit"`.
- If no checks are supplied, Possum infers checks from `feature`, `pages`, and `setup`.
- If checks are supplied, Possum may infer a small number of supplementary checks when the feature brief clearly implies missing user-visible behavior.
- Inferred checks are always reported as `source: "inferred"`.
- The first slice should cap inferred checks to keep runs bounded. A cap of three inferred checks is enough for the initial workflow.

Inference uses the configured LLM provider. If inference fails and there are explicit checks, Possum runs the explicit checks. If inference fails and there are no explicit checks, the run fails fast with a clear configuration/provider error before launching browser verification.

## Execution flow

```text
CLI/MCP input
  │
  ▼
resolve target URL / run command / models / budgets
  │
  ▼
parse and normalize feature verification brief
  │
  ├─ infer checks when needed
  │
  ▼
create .possum/runs/<runId> with runType = "feature_verification"
  │
  ▼
start app if runCommand provided
  │
  ▼
launch browser and run setup phase
  │
  ├─ setup passed → run each check
  │
  └─ setup failed → mark all checks inconclusive
  │
  ▼
write verification summary + findings + report + artifacts
```

## LLM browser verifier

The verifier is a loop around a Playwright page and an LLM client. It should be separate from claim verification code, but can reuse existing LLM clients, timeout budgets, progress patterns, and run-store helpers.

Suggested files:

- `src/verification/types.ts` — brief, check, setup, result, and summary types.
- `src/verification/checkInference.ts` — LLM check inference.
- `src/verification/browserVerifier.ts` — LLM action loop over Playwright.
- `src/verification/featureVerification.ts` — orchestration for feature verification.
- `src/verification/appVerification.ts` — thin wrapper around current `runAudit` for the first slice.

### Verifier actions

The LLM should choose from a constrained JSON action protocol. Initial actions:

- `goto` — navigate to a same-origin path or one of the requested pages.
- `click` — click visible text or a described control.
- `fill` — fill a field by label, placeholder, accessible name, or selector hint.
- `press` — press a key such as `Enter`.
- `wait` — wait briefly for UI updates.
- `observe` — request a fresh page observation.
- `conclude` — finish with `passed`, `failed`, or `inconclusive` plus reason.

The executor, not the LLM, enforces:

- same-origin navigation only;
- max steps per setup/check;
- wall-clock budget;
- request timeout;
- valid JSON action schema;
- screenshot/trace capture.

Download checks should be supported by allowing an action to include `expectDownload: true`; the executor wraps the click in Playwright download waiting and records filename/path metadata as evidence.

## Setup phase

Setup is executed once before checks.

- Input: ordered `setup` instructions plus feature/page context.
- Output: `passed` or `inconclusive` with action log and reason.
- If setup is omitted, setup phase is recorded as `skipped`.
- If setup fails or hits budget, every check is marked `inconclusive` with reason `setup failed` or `setup inconclusive`.
- Setup failure does not create feature-failure findings in the first slice.

## Check verdicts

```ts
type VerificationVerdict = "passed" | "failed" | "inconclusive";
```

- `passed` — verifier found evidence that the expected behavior works.
- `failed` — verifier found evidence that the expected behavior does not work.
- `inconclusive` — verifier could not determine the result because of setup failure, app unreachability, provider error, timeout, ambiguous UI, or budget exhaustion.

Only `failed` creates a normal Possum finding.

## Artifact model

Reuse `.possum/runs/<runId>`.

Add `runType` to run reports:

```ts
type PossumRunType = "audit" | "app_verification" | "feature_verification";
```

Feature verification writes:

- `report.md` — human-readable summary.
- `findings.json` — failed checks as normal Possum findings.
- `verification.json` — structured feature verification summary.
- `surface.json` — optional if the workflow captures app surface data.
- `findings/<findingId>/trace.json` — action trace for failed checks.
- `findings/<findingId>/repro.spec.ts` — best-effort Playwright repro for failed checks.
- check-level screenshots/traces where practical.

The summary should include all checks, including passed and inconclusive checks, so coding agents can decide whether to retry, fix, or ask the user for better setup.

## Finding shape for failed checks

Failed checks map into normal `Finding` records using a new persona/category such as `feature`.

- `persona: "feature"`
- `severity: "high"` for explicit failed checks, `medium` for inferred failed checks by default.
- `confidence: "confirmed"` when the verifier has concrete browser evidence.
- `claim` should contain the check text.
- `expected` should contain the expected behavior.
- `actual` should contain the observed failure.
- `reproducibility` should use `{ status: "reproduced", attempts: 1 }` in the first slice.
- `dedupeFingerprint` should include feature/check id and target route.

Passed and inconclusive checks do not appear in `findings.json`.

## CLI design

Add:

```bash
possum verify-feature --brief feature.json [--url <url>] [--command <command>]
possum verify-app [--url <url>] [--command <command>]
possum audit [--url <url>] [--command <command>]
```

Behavior:

- `verify-feature` requires `models` config because it is LLM-driven.
- `verify-feature` accepts target URL/run command from flags or `possum.config.json`.
- `verify-feature` prints progress to stderr and stable paths/run id to stdout, matching current `audit` behavior.
- `verify-app` initially calls the current audit implementation and writes `runType: "app_verification"` where possible.
- `audit` remains a compatibility alias for `verify-app`; docs should steer new users toward `verify-app`.

## MCP design

Add tools:

```text
verify_feature
verify_app
```

Keep:

```text
run_audit
```

`verify_feature` input:

```ts
{
  rootDir?: string;
  targetUrl?: string;
  runCommand?: string;
  brief: FeatureVerificationBrief;
}
```

`verify_feature` output should include structured content:

```ts
{
  runId: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
  verificationJsonPath: string;
  summary: {
    feature: string;
    setup: { status: "passed" | "skipped" | "inconclusive"; reason?: string };
    checks: Array<{
      id: string;
      source: "explicit" | "inferred";
      text: string;
      verdict: "passed" | "failed" | "inconclusive";
      reason: string;
    }>;
  };
}
```

`verify_app` initially mirrors `run_audit` behavior. `run_audit` remains for compatibility.

## Progress output

Feature verification should emit compact progress events:

- `feature-setup-start`
- `feature-setup-done`
- `feature-check-start`
- `feature-check-step`
- `feature-check-done`

CLI formatting examples:

```text
possum: setup — logging in and opening Reports...
possum: check 1/3 — "Click Export CSV and confirm a CSV downloads"
possum: check 1/3 · step 3/20...
possum: check 1/3 — failed
```

MCP does not need streaming progress in the first slice unless existing infrastructure already supports it cleanly.

## Error handling

- Invalid brief schema → fail fast with actionable message.
- Missing model config for `verify-feature` → fail fast explaining that feature verification requires `models`.
- App startup failure → run ends with setup/checks inconclusive and an access-style finding only if current app verification behavior already produces one.
- Setup failure → all checks inconclusive, no feature findings.
- LLM/provider timeout during one check → that check inconclusive, no finding.
- Invalid LLM action → retry within the same step budget; repeated invalid actions lead to inconclusive.
- External navigation attempt → blocked and reported to the LLM; repeated attempts lead to inconclusive.
- Failed check with browser evidence → normal finding plus verification summary entry.

## Backwards compatibility and migration

- Existing `possum audit` command remains valid.
- Existing MCP `run_audit` remains valid.
- Existing `possum.config.json` remains valid.
- Existing deterministic personas and claim-vs-reality behavior remain part of app verification.
- New docs should describe `verify-app` as the primary command and `audit` as a compatibility alias.

## Testing plan

Focused tests for the first slice:

- **Brief schema** — parses minimal brief; parses setup/check hints; rejects empty feature.
- **Check normalization** — explicit checks marked `explicit`; inferred checks marked `inferred`; inferred cap enforced.
- **Check inference** — scripted LLM turns feature/pages into checks; inference failure with explicit checks still runs explicit checks.
- **Browser verifier** — passed check produces summary only; failed check produces finding; provider error produces inconclusive.
- **Setup phase** — setup failure marks all checks inconclusive and creates no feature findings.
- **Download check** — fixture app verifies download metadata can be captured.
- **CLI** — `verify-feature --brief` writes run artifacts and stable stdout lines.
- **MCP** — `verify_feature` returns structured summary and paths.
- **App wrapper** — `verify-app` runs current audit behavior.
- **Compatibility** — `audit` and `run_audit` still pass existing tests.

## Known follow-ups

- Full `verify-app` planner that combines explicit app checklist, discovered pages/forms/nav, and claim-derived checks.
- Richer generated Playwright repros for complex LLM-driven paths.
- Optional deterministic execution for strongly structured hints.
- Better auth/session handoff, such as browser storage state files.
- Check prioritization and risk scoring for large apps.
- Streaming progress for MCP clients if the SDK path supports it cleanly.
