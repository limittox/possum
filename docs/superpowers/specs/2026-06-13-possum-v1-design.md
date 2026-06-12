# Possum v1 Design

**Date:** 2026-06-13
**Status:** Approved direction — design spec for v1.
**Supersedes:** [2026-06-13-possum-differentiator-brainstorm.md](2026-06-13-possum-differentiator-brainstorm.md)
(kept as history; note v1 has since pivoted from "coding agent" to "testing agent" and from
CLI tools to web UIs).

---

## 1. What Possum Is

> **AI built your app. Possum is the customer who tries to use it — before real ones do.**

Possum is a terminal-native testing agent. It unleashes a cast of simulated customers —
the beginner, the impatient, the hostile, the returning — on your web app inside a sandbox,
watches where they fail, and files bug reports with screenshots and replayable repro
scripts that your coding agent can fix.

**What possum is NOT:**
- Not a coding agent. It never edits your code. It finds problems and hands them to the
  coding agent you already use (Claude Code, Cursor, Codex).
- Not a test-case generator. It doesn't write test files into your suite; it *uses* your
  software the way customers do.
- Not a coverage platform. No dashboard, no SaaS, no "test management." Findings are plain
  files in your repo.

**Audience:** developers shipping web apps with AI coding tools — solo devs, vibe coders,
small product teams with no QA function. They live in the terminal; possum meets them there.

## 2. Decisions Log

| Decision | Choice | Why |
|---|---|---|
| Product identity | Testing agent, not coding agent | Complementary to incumbent coding agents instead of competing; verification is the post-AI bottleneck; scope shippable by a small team |
| Coding-agent relationship | Deep integration | Handoff packets + MCP server + fix verification. Possum is the verification layer of the agentic stack — and the referee of other agents' fixes |
| v1 surface | Web UIs (full pivot; CLI dropped from v1) | Market size; personas are literal customers in a browser; the vibe-coder wave needs exactly this; one deep driver beats two shallow ones |
| Run mode | Local-first (`possum swarm` in the terminal) | Fastest build, best demo, terminal-native identity. CI wrapper is fast-follow |
| Personas | All four: beginner, impatient, hostile, returning | The cast is the product. Returning user flagged experimental (most complex), cut first under pressure |
| Sandbox | Lightweight namespaces (bubblewrap) | Zero install dependency (single binary, no Docker wall), instant startup. Cost: Linux-only v1 (WSL2 + CI ok), weaker isolation — stated loudly |
| Implementation language | Go (assumption, not yet locked) | Single static binary, natural fit for namespace orchestration and CLI distribution |
| Models | BYO API key, Anthropic first. Cheap vision model for personas; stronger model for the judge | Personas are wide and cheap; judgment is narrow and smart |

## 3. Core Flow

```
possum swarm
  1. LAUNCH     figure out how to run the app (dev-server command from
                package.json / README / framework detection, or user-
                supplied), start it inside the sandbox, wait until reachable
  2. DISCOVER   crawl the running app: routes, forms, flows; read README /
                landing copy for what the app CLAIMS to do → surface map
  3. CAST       spawn personas, each with its own headless-browser context
                (own cookies/storage) against the sandboxed app
  4. EXPLORE    personas pursue missions via Playwright, reasoning over
                screenshots + DOM; every action recorded
  5. JUDGE      candidate findings re-run for reproducibility (must
                reproduce twice), deduped, severity-ranked (stronger model)
  6. REPORT     .possum/runs/<id>/: report.md, screenshots, repro as a
                runnable Playwright script
  7. HANDOFF    possum handoff <finding> → agent-ready packet on stdout
                (pipe into claude/cursor); MCP server for agent-driven runs
  8. VERIFY     possum verify <finding> replays the repro after a fix —
                possum referees whether the coding agent actually fixed it
```

## 4. The Cast

Each persona = system prompt + behavior policy + a "what counts as a finding" rubric.
Personas explore *behavior space* the way real customers do (vs. fuzzing's blind input
space). Each runs a fast vision-capable model with bounded exploration time.

### The beginner
Lands on the homepage knowing nothing. Tries to accomplish what the app *claims* to offer
(from README / landing copy). Never uses developer knowledge, never reads code, never
infers around a broken step.
**Finds:** broken onboarding, dead ends, silently failing forms, "obvious to the author"
navigation, docs/claims drift.

### The impatient user
Double-clicks submit. Hits back mid-flow. Refreshes during saves. Abandons forms and
retries. Opens the same page in two tabs.
**Finds:** duplicate submissions, corrupted state, lost form data, race conditions,
non-idempotent operations.

### The hostile user
Injection strings in every form. URL/parameter tampering. Oversized uploads. Script tags
in profile names. Unicode tricks.
**Finds:** validation gaps, XSS-shaped bugs, unhandled errors, information leaks in error
pages. (Positioned as robustness findings, not a security audit.)

### The returning user *(experimental in v1)*
Has stale state: old localStorage, expired session tokens, an existing account mid-flow,
artifacts from a previous app version.
**Finds:** session-handling bugs, migration breaks, the "works in incognito" failure class.
Most complex to build (requires a state-seeding phase before exploration); ships flagged
experimental and is the first cut under schedule pressure.

## 5. Components

### `possum` CLI
Single static binary. Commands for v1:
`possum swarm` (full run) · `possum handoff <finding>` · `possum verify <finding>` ·
`possum report [run]` (re-render findings) · `possum mcp` (serve MCP).

### Launcher
Detects how to run the app: framework detection for common stacks (Next.js, Vite, Rails,
Django, Express), `package.json` scripts, README instructions. If detection fails, it asks
the user for the run command — **it never guesses forever**. Handles throwaway DB/seed
setup where the framework makes that discoverable; otherwise documents what it ran against.

### Surface mapper
Crawls the sandboxed app (routes, forms, interactive elements) and reads README/landing
copy to extract *claims* (what the app says users can do). Output: a human-reviewable YAML
surface map in `.possum/surface.yaml`; users can correct/scope it (e.g., exclude routes).

### Persona engine
One orchestrator, four persona definitions. Tools exposed to personas: `navigate`, `click`,
`fill`, `screenshot`, `read_dom`, `note_finding`. Every action is logged to a structured
trace (the raw material for repro scripts).

### Sandbox runner
bubblewrap/user namespaces wrapping the *app under test*: project copy, tmpfs home,
read-only system dirs, network restricted to localhost. The headless browser talks only to
the sandboxed app. v1 is Linux-only (incl. WSL2 and CI runners); macOS is fast-follow.
v1 docs state plainly: weaker isolation than VMs — run on projects you trust.

### Judge
The signal-to-noise firewall, and the component with engineering priority over persona
cleverness. Pipeline: candidate finding → replay it from the trace → must reproduce twice
→ dedupe against other findings (same root symptom) → severity rank → only then report.
Flaky findings die here and are never shown. Target: 3 real findings beat 30 maybes.

### Finding store
`.possum/` in the repo — plain files, git-committable, no database:

```
.possum/
  surface.yaml                   # reviewable app map
  runs/<id>/
    report.md                    # human summary of the run
    findings/<finding-id>/
      report.md                  # what happened, expected vs actual, severity
      repro.spec.ts              # runnable Playwright script
      screenshots/               # evidence
      trace.json                 # full action log
```

### Integration layer
- **`possum handoff <finding>`** — emits a self-contained packet (report + repro + relevant
  context) as structured markdown on stdout, designed to be piped into a coding agent.
- **MCP server** (`possum mcp`) — exposes `run_swarm`, `list_findings`, `get_finding`,
  `verify_fix`, so coding agents can invoke possum themselves.
- **`possum verify <finding>`** — replays the repro against the (re-launched) app and
  reports fixed/not-fixed. This is the loop-closer: the coding agent claims a fix; possum
  referees it.

## 6. Error Handling

- **App won't launch:** show what was tried, ask for the run command. Never burn tokens
  retry-guessing.
- **Persona gets stuck** (e.g., auth wall with no test account): persona notes the blocker
  as an *access finding* ("couldn't get past login — provide seed credentials in
  possum.toml") and moves on; the run completes with partial coverage clearly stated.
- **Flaky behavior:** judge's reproduce-twice rule. Irreproducible candidates are logged in
  trace but never reported.
- **Budget:** per-persona exploration is time/step-bounded; a cost estimate is shown before
  the run starts (the "possum quotes before it works" principle).
- **Honest stopping (the possum move):** if a run produces low-confidence noise or the app
  is too broken to explore, possum says exactly that — "the beginner couldn't get past the
  homepage; nothing else is reachable" — rather than padding the report.

## 7. Testing Strategy (for possum itself)

- **Fixture apps:** a set of small intentionally-buggy web apps (one per persona specialty:
  a docs-drifted onboarding, a double-submit checkout, an unvalidated form, a
  session-migration break) used as end-to-end regression suites — each fixture has known
  findings possum must catch, and known non-bugs it must not report (noise regression).
- **Judge unit tests:** dedupe and reproduce-twice logic tested against recorded traces.
- **Sandbox tests:** assert escape-prevention basics (no writes outside sandbox, no
  non-localhost network).
- **Determinism aids:** record/replay of model calls for cheap CI runs of orchestration logic.

## 8. Competitive Positioning

The agentic-QA category (TestSprite, Momentic, QA Wolf, Octomind, Bug0) sells **test
coverage dashboards to QA processes**. Possum is **a customer simulator in the dev loop**:

| Dimension | Incumbents | Possum |
|---|---|---|
| Home | SaaS dashboard | Terminal, local-first |
| Model | Test generation & coverage | A cast of characterized customers |
| Output | Tickets in Jira/Linear | Screenshots + replayable repro scripts in your repo |
| Buyer | QA org | The developer (often with no QA org) |
| Coding-agent loop | Bolt-on integrations | First-class: handoff packets, MCP, fix refereeing |

Language discipline is existential, not cosmetic: possum never says "test coverage" — it
says *"possum couldn't check out either."* Persona-based exploration is validated by
research (WebProber, arXiv 2509.05197) and by Sierra's persona simulations for
conversational agents; nobody has productized it for web apps in the dev loop.

## 9. Risks

1. **Crowded category** — differentiation rests on positioning (dev-loop customer
   simulator) and the agent-referee loop. Drifting into "coverage platform" language or
   features kills the identity.
2. **"How do I run this app"** is the hardest environment problem (dev server, DB, seed
   data). Mitigation: common-stack detection + ask-the-user fallback; never guess forever.
3. **Browser-agent flakiness** — mitigated by the judge as a hard gate, not best-effort.
4. **Cost per run** — vision tokens add up. Mitigations: bounded exploration, cheap persona
   models, pre-run cost estimate.
5. **Linux-only v1** — accepted (WSL2 + CI covers most of the audience); macOS sandbox is
   the first post-v1 platform task.
6. **Returning-user persona complexity** — flagged experimental; first cut under pressure.

## 10. Out of Scope for v1 (explicit)

- CLI / HTTP-API testing surfaces (dropped in the pivot; may return as future drivers)
- CI wrapper / GitHub Action (fast-follow after local v1)
- macOS/Windows-native sandboxing (fast-follow)
- Native/desktop/mobile UI testing
- Multi-user concurrent persona interactions (two personas colliding in one app)
- Any "test management" features (suites, dashboards, history analytics)

## 11. Open Questions for the Implementation Plan

- Lock the implementation language (Go assumed; confirm vs Rust/TypeScript — note the
  Playwright dependency may argue for a TS component or driving Playwright via CDP from Go).
- Playwright integration shape: embed `playwright` via a Node sidecar process, or speak CDP
  directly from the binary?
- Config file (`possum.toml`?) schema: run command, seed credentials, route scoping, budgets.
- Finding-ID scheme and report.md format spec (also the handoff packet format).
- Pre-run cost estimation model (tokens per persona-minute heuristics).
- Fixture-app set: which four bugs ship as the regression suite first?
