# Claims-phase timeout, wall-clock budget & per-step progress — design

**Date:** 2026-06-25
**Status:** Approved (brainstorming)
**Topic:** Make the optional `claims` persona resilient to stalls and observable while it runs.

## Problem

The `claims` persona is Possum's only unbounded phase. It runs:

```
triageClaims (1 LLM call)
  for each triaged claim:
    for attempt in 0..attempts (default 2):
      verifyClaim → up to maxSteps (default 30) sequential observe + LLM round-trips
```

Three independent gaps let it hang and hide its progress:

1. **No per-request timeout.** `openRouterClient.complete` and `anthropicClient.complete`
   `await` the network/SDK call with no `AbortSignal`. A single stalled request blocks
   the whole audit indefinitely.
2. **Unenforced wall-clock budget.** `budgets.maxMinutesPerPersona` (default 5) exists in
   the config schema but is read nowhere — only `maxStepsPerPersona` is wired through
   `resolveAuditTarget`. Worst-case work is `claims × attempts × maxSteps` sequential
   requests with no wall-clock ceiling.
3. **Silent black box.** The claims phase emits only `phase-start` and `phase-done`. During
   the long inner loop the operator cannot tell whether it is working or dead — the exact
   symptom that triggered this work (`stuck on [4/4] claims`).

## Goals

- A stalled LLM request cannot hang the audit.
- The claims phase respects a wall-clock budget and stops cleanly when it is exceeded.
- The operator sees live, per-step progress during the claims phase.
- Infrastructure failures (timeouts, errors, budget cutoffs) **never** fabricate a finding
  and **never** crash the run.

## Non-goals

- Changing the deterministic personas (beginner/impatient/hostile) — they are already
  bounded by Playwright timeouts.
- Changing triage behavior. A triage-call failure (e.g. missing API key) keeps today's
  behavior of surfacing as the run's access finding. See *Known edges*.
- Parallelizing claim verification or otherwise speeding it up. This is a reliability and
  observability change only.

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Per-request timeout source | New config field `budgets.requestTimeoutSeconds`, default **60** | Tunable home alongside existing budgets; slow models can raise it. |
| Timeout/error mid-claim | Treat the attempt as **inconclusive** | An infra timeout is not evidence the app failed; must not produce a finding or crash. |
| Cancellation strategy | **Client owns the per-request timeout; the verify loop owns the wall-clock budget** (approach B) | Smallest blast radius — no change to the `LlmClient.complete` signature. Real per-request cancellation; clean separation of concerns. |

### Approach B vs alternatives

- **A — single `AbortSignal` threaded top-down** (change `complete(request, signal?)`, combine
  budget + request signals via `AbortSignal.any`). Most unified, but changes the shared
  interface (touches the scripted client and every caller) and maps awkwardly to
  "inconclusive." Rejected for blast radius.
- **C — `withTimeout(llm)` decorator racing `complete()` against a timer.** No interface
  change, but only *abandons* the slow request; the underlying fetch keeps running and holds
  the socket. Rejected — leaks work, no true cancellation.

Trade-off accepted with B: the wall-clock budget is checked at step boundaries, so the
worst-case overrun is one in-flight request (≤ the request timeout, default 60s).

## Architecture

```
config.budgets.{requestTimeoutSeconds, maxMinutesPerPersona}
        │ resolveAuditTarget
        ▼
   main.ts  →  requestTimeoutMs, budgetMs
        │ resolveClaimVerification(models, maxSteps, { requestTimeoutMs, budgetMs })
        ▼
   LLM client (timeoutMs)             AuditClaimVerification { ..., budgetMs }
   AbortSignal.timeout per request          │ runAudit
        │                                    ▼
        └────────────► verifyClaimsWithStability(deadline, onProgress)
                              │  per-claim deadline check, aggregation
                              ▼
                         verifyClaim(deadline, now, onProgress)
                              per-step deadline check, try/catch → inconclusive
```

Two concerns, two homes:

- **Per-request** timeout lives in the LLM clients (construction-time `timeoutMs`, internal
  `AbortSignal.timeout`). The `LlmClient.complete` signature is unchanged.
- **Wall-clock** budget lives in the verify loop as cheap `now() >= deadline` checks.

## Component changes

### 1. Config & wiring

- **`src/contracts/config.ts`** — add `requestTimeoutSeconds: z.number().int().positive().default(60)`
  to the `budgets` object and to its `.default(...)` literal.
- **`src/config/appConfig.ts`** — `ResolvedAuditTarget` gains `maxMinutesPerPersona?: number`
  and `requestTimeoutSeconds?: number`; `resolveAuditTarget` reads both from `config.budgets`.
- **`src/cli/main.ts`** — compute `requestTimeoutMs = (requestTimeoutSeconds ?? 60) * 1000`
  and `budgetMs = (maxMinutesPerPersona ?? 5) * 60_000`; pass both into
  `resolveClaimVerification`.
- **`src/llm/resolveLlmClient.ts`** — extend `resolveClaimVerification` to accept
  `{ requestTimeoutMs, budgetMs }`, pass `timeoutMs` into the client constructors, and add
  `budgetMs` to `ResolvedClaimVerification`.
- **`src/audit/audit.ts`** — `AuditClaimVerification` gains `budgetMs: number`; `runAudit`
  passes `budgetMs` and the existing `report` reporter into `verifyClaimsWithStability`.

### 2. Per-request timeout (clients)

- **`src/llm/errors.ts`** (new) — `export class LlmTimeoutError extends Error` so the timeout
  path is assertable in tests.
- **`src/llm/openRouterClient.ts`** — `OpenRouterClientOptions` gains `timeoutMs?: number`;
  the `FetchLike` init type gains an optional `signal?: AbortSignal`; `complete` passes
  `signal: AbortSignal.timeout(timeoutMs)` to `fetchImpl` when set. An abort/timeout rejection
  is caught and rethrown as `LlmTimeoutError`.
- **`src/llm/anthropicClient.ts`** — `AnthropicClientOptions` gains `timeoutMs?: number`; the
  `AnthropicLike.messages.create` shim accepts an optional second arg `{ signal?: AbortSignal }`;
  `complete` passes `AbortSignal.timeout(timeoutMs)`. An abort/timeout is rethrown as
  `LlmTimeoutError`. (The real `@anthropic-ai/sdk` honors a `signal` request option.)

### 3. Inconclusive verdict & aggregation

- **`src/audit/claimAgent.ts`**
  - `ClaimVerdict` becomes `"fulfilled" | "unfulfilled" | "inconclusive"`. The LLM *response*
    schema (`ActionSchema`) stays `fulfilled|unfulfilled` — only the harness emits
    `inconclusive`.
  - `VerifyClaimInput` gains `deadline: number` (absolute epoch ms), `now?: () => number`
    (default `Date.now`), and an optional progress reporter.
  - In the step loop: wrap `observe` + `complete` in try/catch. Any thrown error → push a
    conclude step with verdict `inconclusive` (reason from the error) and return cleanly. At
    the top of each iteration, if `now() >= deadline`, conclude `inconclusive`
    (reason "wall-clock budget reached") and return. Emit a `claim-step` event per iteration.
- **`src/audit/claimVerification.ts`** — new aggregation, so infra flakiness can never
  fabricate a finding:
  - any attempt `inconclusive` → **skip the claim, no finding**
  - all attempts `fulfilled` → skip
  - otherwise → finding; `reproduced` iff all attempts `unfulfilled`, else `not_reproduced`
    (unchanged from today)

### 4. Wall-clock budget (verify loop)

- **`src/audit/claimVerification.ts`** — `VerifyClaimsInput` gains `budgetMs: number`,
  `now?: () => number` (default `Date.now`), and the progress reporter. Compute
  `deadline = now() + budgetMs` once. Check `now() >= deadline` **before each claim**
  (stop the loop) and pass `deadline` into `verifyClaim` for **per-step** checks. Return
  `{ confirmed, processed, total, truncated }` instead of a bare array; `runAudit` uses the
  summary to emit an honest phase outcome. Unprocessed claims are never turned into findings.

### 5. Per-step progress events

- **`src/audit/progress.ts`** — extend `AuditProgressEvent` with:
  - `{ type: "claim-start"; index: number; total: number; claim: string }`
  - `{ type: "claim-step"; index: number; total: number; attempt: number; attempts: number; step: number; maxSteps: number }`
  - `{ type: "claim-done"; index: number; total: number; verdict: "fulfilled" | "unfulfilled" | "inconclusive" }`
  - `{ type: "claims-truncated"; processed: number; total: number }`
- **`src/cli/auditProgress.ts`** — format them as indented sub-lines, e.g.:
  - `possum:   claim 1/3 — "See an estimate, right now"…`
  - `possum:   claim 1/3 · attempt 1/2 · step 4/30…`  *(liveness heartbeat)*
  - `possum:   claim 1/3 — inconclusive`
  - `possum: claims — budget reached, verified 2/3 claims`
  - Long claim text is truncated for the one-line label.

Emission ownership: `verifyClaimsWithStability` emits `claim-start` / `claim-done`
(per claim, across attempts) and `claims-truncated`; `verifyClaim` emits `claim-step`
(per step). `runAudit` continues to emit `phase-start` / `phase-done` / `judge-done`.

## Error handling

| Situation | Behavior |
| --- | --- |
| Per-request timeout | client throws `LlmTimeoutError` → caught in `verifyClaim` → attempt `inconclusive` |
| Any other mid-claim error | caught in `verifyClaim` → attempt `inconclusive` (reason carries the message) |
| Wall-clock budget exceeded | stop before the next claim / conclude the current step `inconclusive`; emit `claims-truncated`; no fabricated findings |
| Triage-call failure (missing key, malformed) | **out of scope** — keeps today's behavior (propagates to the run's access finding) |

## Testing (TDD, red → green)

- **Client tests** — a hanging `fetch` / SDK stub plus a short `timeoutMs` → `complete`
  rejects with `LlmTimeoutError`; assert the `signal` is forwarded.
- **`claimAgent`** — a throwing `llm` → `verifyClaim` returns `inconclusive`, no crash; a
  past `deadline` → `inconclusive` ("budget").
- **`claimVerification`** — an `inconclusive` attempt → no finding; a budget cutoff (injected
  `now`) → `processed < total`, `truncated === true`.
- **`claimAudit` integration** — an erroring client → audit completes, produces no claim
  finding, and still lists the `claims` persona.
- **`auditProgress`** — format each of the four new events.
- **config tests** — `requestTimeoutSeconds` default + override parse; `resolveAuditTarget`
  surfaces `requestTimeoutSeconds` and `maxMinutesPerPersona`.
- **Update** the existing `claimAudit` "reports per-phase progress events in order" test —
  its exact `toEqual` sequence now includes the claim sub-events.

Tests that need a throwing/hanging client use a small inline `LlmClient` stub rather than
modifying `ScriptedLlmClient`.

## Known edges / follow-ups

- Triage-call failure surfacing as an access finding is misleading but pre-existing; left for
  a separate change.
- Per-step lines can reach ~`maxSteps` per attempt for a stuck claim. That verbosity is the
  intended liveness signal; kept compact and line-based (no cursor rewriting).
