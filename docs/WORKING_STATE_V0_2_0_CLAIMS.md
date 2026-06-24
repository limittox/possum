# Possum v0.2.0 Claim-vs-Reality Working State

Date: 2026-06-15

ADR: `docs/adr/0004-possum-v0-2-0-claim-vs-reality.md`
Plan: `docs/superpowers/plans/2026-06-15-possum-v0-2-0-claim-vs-reality.md`

## Implemented

- Added an injected `LlmClient` interface with a deterministic `ScriptedLlmClient` for tests.
- Added `"claims"` to `PersonaSchema` so claim findings flow through the finding/judge/report machinery.
- Added LLM claim triage that keeps only UI-verifiable claims (`src/audit/claimTriage.ts`).
- Added a `ClaimPage` boundary (interface + in-memory fake) and a Playwright adapter.
- Added the claim-verification agent loop (`src/audit/claimAgent.ts`) bounded by a step budget.
- Added stability-re-run confirmation (`src/audit/claimVerification.ts`): a claim is `reproduced` only when unfulfilled on every attempt; mixed attempts are `not_reproduced` and dropped by the existing judge gate.
- Added the `finding_claim_unfulfilled_*` finding builder (`src/personas/claims.ts`).
- Wired opt-in claim verification into `runAudit`; it runs only when `models` is configured and is otherwise skipped (v0.1.x behavior unchanged).
- Surfaced `models` and `budgets.maxStepsPerPersona` from `resolveAuditTarget`; CLI and MCP `run_audit` construct the real client via `resolveClaimVerification`.
- Added the `@anthropic-ai/sdk` adapter (`src/llm/anthropicClient.ts`), resolved lazily at runtime and unit-tested with an injected fake SDK.
- Added an OpenRouter adapter (`src/llm/openRouterClient.ts`) over OpenRouter's OpenAI-compatible REST API using `fetch`, unit-tested with an injected fetch.
- `models.provider` accepts `anthropic` and `openrouter`; `resolveClaimVerification` dispatches per provider.
- Added the `claim-unfulfilled-export` fixture app proving `finding_claim_unfulfilled_001`.

## Scope notes

- Confirmation uses the stability-re-run path from ADR 0004 (confirmation model step 3). Replay-driven confirmation as the primary path remains a follow-up.
- Whole-surface claim verification only; change-scoped claims remain an ADR follow-up.
- Providers `anthropic` (`ANTHROPIC_API_KEY`) and `openrouter` (`OPENROUTER_API_KEY`) are supported. Direct `openai` is reserved in the enum but rejected with a clear error; OpenRouter already reaches OpenAI models via its compatible API.

## Verification

Passed:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

The deterministic core (triage, agent loop, stability, finding builder, fixture audit) is fully covered by unit and integration tests using `ScriptedLlmClient` and an in-memory `ClaimPage`/Playwright. A live `possum audit` against the `claim-unfulfilled-export` fixture with a real `ANTHROPIC_API_KEY` and a `models` config block is the remaining manual smoke check.
