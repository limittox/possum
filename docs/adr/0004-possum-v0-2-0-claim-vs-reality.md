# ADR 0004: Possum v0.2.0 Claim-vs-Reality Verification

Date: 2026-06-15

Status: Accepted

Version: v0.2.0 claim-vs-reality slice

## Context

Possum v0.1.0 through v0.1.2 established the deterministic local core, project
configuration, and coding-agent integration guidance. The README positions
Possum as a tool that "tests claim-vs-reality from README, homepage, and product
copy," but the implementation only *records* claims. `surfaceProbe.ts` and
`claimExtractor.ts` extract homepage and README claims into
`.possum/runs/<runId>/surface.json` as evidence, and nothing judges whether the
running app actually delivers on them. ADR 0001 deferred this on purpose:
"broad semantic claim judging is deferred."

This is the largest gap between Possum's stated promise and its behavior. It is
also the natural first model-driven surface, because the claim inputs and the
finding, gate, repro, and report contracts already exist. Closing it makes the
existing positioning honest and proves out the plumbing for later model-driven
work without rewriting the deterministic personas.

## Decision

Possum v0.2.0 will add an opt-in, LLM-driven claim-verification agent.

Accepted v0.2.0 surface:

- Add a claim-verification agent that, for each UI-verifiable app claim, attempts
  to fulfil the claim by navigating the running app, then writes a finding when
  it cannot.
- Run claim verification only when `models` is configured in
  `possum.config.json`. With no model configured, the deterministic core behaves
  exactly as in v0.1.x.
- Verify the claims the app currently makes about itself (whole-surface), sourced
  from the existing homepage and README extraction in `surface.json`. Scoping
  claims to a code diff is deferred (see Follow-Ups).
- Triage extracted claims with a cheap LLM step before browsing, keeping only
  UI-verifiable, action-implying claims (for example "Export to PDF") and
  discarding claims that cannot be checked through the UI (for example a license
  statement). Only triaged claims consume agent budget.
- Bound the agent with the existing config budgets,
  `budgets.maxStepsPerPersona` and `budgets.maxMinutesPerPersona`.
- Add a new finding class `finding_claim_unfulfilled_*` carrying `claim`,
  `expected`, and `actual`, with
  `dedupeFingerprint: claims:unfulfilled:<finalUrl>:<normalized-claim>`.
- Add `"claims"` to `PersonaSchema` so claim findings flow through the existing
  finding schema, judge gate, report rendering, and config `personas` array.
  `"claims"` is documented as an evaluation agent, not a customer persona.
- Add a fixture app under `fixtures/apps/` that advertises a capability it does
  not deliver, proving the new finding class, matching the existing
  fixture-per-finding-class convention.

Confirmation model (how a non-deterministic finding earns the existing gate):

1. Discovery is non-deterministic. The agent navigates with the LLM within the
   configured budget and records the concrete steps it took.
2. Confirmation is deterministic where possible. Possum generates a
   `repro.spec.ts` from the recorded steps and replays it; reproduction of that
   script is what sets `reproducibility.status` to `reproduced`.
3. When a claim check cannot be reduced to a replayable assertion, fall back to
   re-running the agent and requiring the claim to fail on every attempt before
   the finding is `confirmed`.
4. The existing `judgeFindings()` gate is unchanged. Candidates that are not
   confirmed and reproduced, or that duplicate a `dedupeFingerprint`, are
   dropped before any report or artifact is written.

Model configuration:

- Default provider `anthropic`. `models.judgeModel` covers claim triage and
  judging; `models.personaModel` covers the agent navigation loop. A mid-tier
  default model is recommended; exact model identifiers are deferred to
  implementation so they do not go stale in this ADR.

Reliability and isolation:

- The LLM client is dependency-injected, following the `execFile` injection
  pattern already used by the CLI and replay paths, so the agent loop is tested
  deterministically with a scripted fake model and no network access.
- Model errors, network failures, and budget exhaustion produce a diagnostic and
  never a fabricated claim finding. Infrastructure failures must not create false
  positives.

## Rationale

Claim-vs-reality is Possum's headline differentiator and the clearest unmet
promise. It is the smallest model-driven slice because the inputs (`claims[]` in
`surface.json`) and outputs (the `Finding` contract, judge gate, repro
generation, report format) already exist; only the verification transform is new.

Opt-in behavior preserves the v0.1.0 principle that the local audit path stays
usable without an account. The deterministic core remains the common denominator,
and the LLM path is purely additive.

The hybrid confirmation model keeps non-determinism contained to discovery while
making confirmation deterministic wherever a claim reduces to a replayable
assertion. This protects the entire reason the judge gate exists and yields a
runnable `repro.spec.ts`, which is exactly the repair input the coding-agent loop
in ADR 0003 depends on.

Claim triage controls cost and keeps the agent focused on claims a customer could
actually act on, avoiding wasted budget on claims that cannot be observed through
the UI.

Whole-surface verification is stateless and matches how claims are already
extracted, avoiding a git and diff dependency in the first model-driven slice.

## Consequences

Positive:

- The README promise to test claim-vs-reality becomes true.
- Possum gains its first model-driven surface while reusing existing contracts.
- Claim findings ship with deterministic, runnable repros for the agent-fix loop.
- The LLM client injection and agent loop become reusable foundations for
  later model-driven personas.
- A new fixture app proves the claim-unfulfilled finding class.

Tradeoffs:

- This introduces Possum's first hard LLM dependency, mitigated by making it
  opt-in and leaving the deterministic core fully functional without a model.
- Claim verification consumes tokens and wall-clock time per run.
- Scope B overlaps with future model-driven personas; this slice deliberately
  builds the agent loop those personas will reuse rather than building them now.
- Claims that are not expressible through the UI are out of scope and are
  filtered out at triage.
- Whole-surface verification re-checks all UI-verifiable claims every run until
  change-scoped claims land.

## Verification Plan

v0.2.0 should ship with tests proving:

- Claim triage keeps UI-verifiable claims and discards non-UI claims, using a
  scripted fake model.
- The agent loop produces a `finding_claim_unfulfilled_*` finding for a claim the
  app fails to fulfil, and produces no finding when the claim is satisfied.
- The agent loop respects `budgets.maxStepsPerPersona` and
  `budgets.maxMinutesPerPersona`.
- A generated claim repro replays deterministically and sets
  `reproducibility.status` to `reproduced`; the non-replayable fallback requires
  failure on every attempt.
- `judgeFindings()` drops unconfirmed, non-reproduced, and duplicate claim
  candidates.
- Claim verification is skipped entirely when `models` is not configured, leaving
  v0.1.x deterministic behavior unchanged.
- Model and network failures produce a diagnostic and no claim finding.
- The new fixture app reproduces the claim-unfulfilled finding class.

Full verification should run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Plus a compiled CLI smoke against the new fixture app, with `models` configured
against a fake or local model client, asserting the claim-unfulfilled finding is
written and the app process is stopped after the audit.

## Follow-Ups

- Add change-scoped claim verification that derives relevant claims from a code
  diff, so a post-task audit only re-verifies claims touched by the change.
- Reuse the claim-verification agent loop to drive model-driven persona
  simulation for beginner, impatient, hostile, and returning personas.
- Add semantic judging for claims that require multi-step flows beyond a single
  agent navigation budget.
- Document recommended model defaults and per-provider setup once the agent loop
  has real usage.
