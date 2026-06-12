# Possum: Differentiator Brainstorm & Competitive Research

**Date:** 2026-06-13
**Status:** Brainstorm — direction not yet locked. Leading candidate: the user-simulation swarm.
**Goal:** Possum is a terminal-based coding agent intended as a real product. It needs one
sharp differentiator that earns adoption against incumbents (Claude Code, Cursor, Aider,
Codex CLI) — something out of the box with high audience impact, not "existing agent but
slightly better."

---

## 1. Idea Catalog

Eight directions were explored across two rounds. The first round attacked workflow gaps;
the second attacked deeper assumptions that every coding agent shares.

### Round 1 — workflow-level ideas

| # | Idea | One-liner | Verdict |
|---|------|-----------|---------|
| 1 | Proof-carrying changes | Every "done" claim must ship an executable verification receipt | Right instinct, but a discipline rather than a capability — copyable. Absorb as a property of a stronger idea. |
| 2 | Multiverse execution | Fork N worktrees, try N approaches in parallel, present a diff-of-diffs | Flashiest demo, but pure orchestration — incumbents are already circling (best-of-N, parallel subagents). Fast-decaying differentiation; N× token cost. |
| 3 | Ambient inverse agent | You code, it watches (shell, tests, git) and stages assists in worktrees unprompted | Boldest interaction-model change. Fatal v1 risk: wrong interruptions get muted within days; needs near-perfect precision from day one. File as long-term vision. |
| 4 | The possum move | Honest stopping: confidence tracking, cost quotes, graceful "I'm stuck" freeze reports instead of thrashing | Great brand layer (fits the name), weak headline — "gives up honestly" is a retention feature, not an adoption driver. Keep as personality. |

### Round 2 — assumption-breaking ideas

| # | Idea | One-liner | Verdict |
|---|------|-----------|---------|
| 5 | Runtime-attached agent | Debugger-native: attach to the live process via DAP/rr, reason from real stack frames instead of guessing from source | Strongest capability gap; original recommendation. Months of plumbing = moat. Risk: per-runtime fiddliness; must nail one language deeply. |
| 6 | Intent ledger (`possum blame`) | Agent conversations become version-controlled provenance; every line traceable to the reasoning that produced it | Cheapest to build, deepest long-term moat (data compounds). Weak day-one demo; cold-start problem. Strong roadmap item. |
| 7 | Program-by-demonstration | Hand-edit one file; possum infers the transformation rule, states it back, sweeps the repo | High demo value, but a feature rather than a product identity. Shines for migrations/refactors. |
| 8 | User-simulation swarm | Persona agents (beginner, impatient, hostile, returning) actually use your software in sandboxes and file repro-backed bug reports | High impact, universal day-one demo, validated mechanism, uncontested niche (see research). **Current leading candidate.** |

---

## 2. Deep Dives

### 2.1 Runtime-attached agent (#5)

**Insight:** Every agent today is a static-text creature — it reads source and guesses what
the program does. Humans debug by running the program and looking at actual values.

**Mechanics:** Speak the Debug Adapter Protocol (DAP) — the standardized JSON protocol used
by every major language debugger (pdb, delve, lldb, node-inspector) — as agent tools:
`set_breakpoint`, `step`, `inspect_frame`, `evaluate_expression`. With `rr` (record/replay),
the agent gets deterministic time travel: record a failing run once, step *backwards* from
the crash to the cause.

**Killer detail:** Reproducing tests are derived from real captured runtime state, not a
guess at what inputs trigger the bug.

**Hard parts:** Per-runtime quirks despite DAP; launch with one language done deeply
(Python). The "record a failing run, interrogate the replay" flow sidesteps the scary
attach-to-prod story.

### 2.2 Intent ledger (#6)

**Insight:** With agents, the *why* behind code now exists in machine-readable form (the
conversation) — and everyone throws it away when the session ends.

**Mechanics:** Each session distills into a structured record (decisions, rejected
alternatives, discovered constraints) stored in-repo (`.possum/ledger/` or git notes),
linked to the lines it produced. `possum blame file:42` answers *why*, with citations.
`possum why "<question>"` queries the accumulated ledger plus mined git/PR history (which
also solves cold start). Possum reads its own ledger before working, so every session makes
the next smarter.

**Hard parts:** Distillation quality is everything — raw transcripts are noise. Value
compounds over weeks, so the day-one demo needs the git-history-mining path.

### 2.3 Ambient inverse agent (#3)

**Insight:** Inverts who watches whom. You never prompt it; it observes your shell history,
test output patterns, git activity, and working-tree diff, and quietly prepares work
products in isolated worktrees, surfacing them only when it has earned the interruption
("that assertion has failed 4 runs in a row; candidate fix staged — [a]pply [v]iew [d]ismiss").

**Why deferred:** Interruption economics are brutally asymmetric — one wrong unprompted
suggestion costs more trust than ten right ones earn. The v1 bar is "interrupts rarely,
right almost every time," the hardest calibration target possible. Privacy (it watches your
shell) and constant background token cost are additional drags. Natural evolution *after*
possum has built runtime-observation muscles in an invited context.

### 2.4 Program-by-demonstration (#7)

You refactor one file by hand; possum diffs it and infers the *rule* ("wrap async handler
bodies in withErrorBoundary; delete try/catch only when it just re-threw"), states the rule
back in English for correction — the crucial step — then sweeps the repo with judgment,
queueing ambiguous sites for review. Closest prior art is keystroke-level editor prediction;
nobody does repo-scale generalize-my-edit. Scoped as a future feature, not the identity.

---

## 3. The User-Simulation Swarm (#8) — Full Treatment

### Core insight

Tests only catch what someone thought to test; they encode the developer's imagination, and
bugs live precisely outside it. No agent today ever actually *uses* the software it writes.
The swarm closes that loop: **possum doesn't just write your code — it inhabits your users.**

### How it works

1. **Interface discovery.** Map the usage surface a human touches: CLI `--help` trees,
   OpenAPI/GraphQL specs, README quickstart, Makefile/package scripts. (The map is valuable
   by itself: "your product as seen from outside.")
2. **Persona casting.** Personas explore *behavior space* the way humans do, where fuzzing
   explores input space blindly. Launch cast:
   - **The beginner** — follows docs literally, never infers. The best docs-rot detector ever built.
   - **The impatient user** — kills mid-operation, retries instantly, double-submits. Finds every missing lock and non-idempotent operation.
   - **The hostile user** — injection strings, boundary values, a file named `--help`, unicode tricks.
   - **The power user** — chains commands in legal-but-unanticipated ways; exhausts flag combinations.
   - **The returning user** — has v1.3 state and config lying around, upgrades, expects things to work.
   Each persona is a cheap, narrowly-prompted agent — the swarm is wide, not deep, keeping cost sane.
3. **Sandboxed execution.** Every persona runs in an isolated container/VM: project copy,
   throwaway DB, no network egress by default. Non-negotiable — the impatient user's *job*
   is to corrupt state.
4. **Structured reports with executable repros.** Every finding ships as a one-command
   repro script (`.possum/swarm/run-NNN/persona-NNN.sh`), deduplicated and severity-triaged.

### The closed loop (the magic hinge)

The swarm's output is the agent's input: `possum fix hostile-001` hands the finding back to
possum-as-developer, which fixes it, then re-runs the persona to confirm. Find the bug as a
user, fix it as a developer, verify as a user — one tool, one loop.

### Workflow modes

- **On demand:** `possum swarm` as a pre-release QA pass.
- **In CI:** findings become PR comments with repro scripts (where paid adoption likely lives).
- **Post-change:** after a feature lands, relevant personas exercise it automatically. The
  author-agent is the worst judge of its own code; the beginner persona doesn't know what
  the code "should" do — exactly why it finds what the author can't.

### Why audience impact is high

- The demo is theater: a cast of characters torturing your software in parallel, then filing
  polite, reproducible bug reports. Instantly legible ("the impatient one — that's my users").
- Findings on real repos are embarrassing in a shareable way: "possum's beginner persona
  couldn't get through my own README" is a self-spreading post.
- Works on any repo on day one — no live bug required, no code possum wrote required.

### Hard parts

- **Sandboxing is the ballgame.** One escaped `rm` and trust is gone permanently.
- **Signal-to-noise.** Report 3 real things, not 30 maybes: dedupe, triage, "must reproduce twice."
- **Environment setup** (installs, services, seed data per repo) is the unglamorous 60% —
  but the same problem every CI product already solves.
- **Interface ceiling.** CLIs/APIs are the sweet spot; web UIs later via browser automation;
  native GUIs out of scope.

---

## 4. Competitive Landscape (web research, June 2026)

**Bottom line: the idea exists in fragments; nobody has built the specific thing.**

### Agentic web-QA platforms — closest commercial category

[TestSprite](https://www.testsprite.com/), [Momentic](https://www.testsprite.com/use-cases/en/the-best-momentic-alternative-tools),
[Bug0](https://bug0.com/), [QA flow](https://www.qaflow.com/bug-reporting),
[bugAgent](https://bugagent.com/), [QA Wolf](https://www.shiplight.ai/blog/best-agentic-qa-tools-2026).
Autonomously explore apps, generate tests, file bug reports with repro steps/video/logs.
**TestSprite is the one to study:** it closes the loop with coding agents, feeding fix
recommendations into Cursor and Claude Code. But all share one shape: browser-first web-app
testing, SaaS dashboards, framed as test coverage. None are terminal-native, none target
CLIs/APIs/dev tools, none use personas.

### Persona-based exploration — validated in research, unproductized

[WebProber (arXiv, 2025)](https://arxiv.org/html/2509.05197v1): an agent exploring websites
as persona-driven simulated users found 29 usability issues across 120 sites that
traditional tools missed. [Sierra](https://sierra.ai/blog/simulations-the-secret-behind-every-great-agent)
uses persona simulations (impatient/confused/malicious) — but to test conversational AI
agents, not software generally. The mechanism works and is unowned as a product.

### Antithesis — the heavyweight at the top end

[Antithesis](https://antithesis.com/) ([how it works](https://antithesis.com/product/how_antithesis_works/)):
deterministic simulation with autonomous fault injection and perfect reproducibility. Owns
part of the "impatient user" territory (mid-operation kills, race conditions) but is
enterprise-priced, aimed at distributed systems (etcd, FoundationDB), requires the stack to
run in their VM environment. Validates the market; doesn't compete at possum's level.

### Docs-drift testing — wide open

No productized "agent follows your README like a beginner and reports where it breaks" was
found — only [blog advice to do it manually](https://debbie.codes/blog/built-agent-skill-readme-wizard/).
The beginner persona may be the single most uncontested piece of the concept.

### The unclaimed intersection

| Dimension | Incumbents | Possum swarm |
|---|---|---|
| Surface | Web apps in browsers | CLIs, APIs, dev tools |
| Home | SaaS dashboard | Terminal, local-first |
| Model | Test generation & coverage | A cast of characterized users |
| Output | Tickets in Jira/Linear | Executable repro scripts in your repo |
| Loop | Separate tool from your coding agent | Same agent finds it and fixes it |

**Strategic notes from the research:**
1. "Agentic QA" is crowding fast — possum must not position as a testing tool. It is a
   *coding agent* whose verification superpower is being your users. That keeps it in the
   larger coding-agent category, out of the TestSprite knife-fight.
2. TestSprite shows the closed-loop insight alone is no longer unique — but they close it
   across two products; possum closes it inside one agent, in the terminal, for software
   that doesn't even have a UI.
3. Lead with the surfaces nobody covers (CLIs, APIs, READMEs); don't fight for web apps on day one.

---

## 5. Synthesis & Positioning

Ideas #5 (runtime-attach) and #8 (swarm) are the same thesis from two sides:

> **Possum is the agent that runs your software instead of guessing about it.**
> The swarm is the thesis from the outside (drive the program like users do);
> runtime attach is the thesis from the inside (interrogate the live process).

Proposed product arc:

1. **v1 — the swarm** (leading candidate): cheaper to build than runtime-attach, universally
   demoable on day one, viral findings, and the `possum fix` loop pulls users into the full
   coding-agent identity.
2. **Trust layer from day one:** evidence-backed claims (#1) and the possum move (#4) —
   receipts on success, honest freeze reports when stuck. Cheap, on-brand ("plays possum
   instead of thrashing").
3. **Later:** runtime attach (#5) — "now possum debugs what the swarm catches, from inside
   the process"; intent ledger (#6) once there are sessions worth mining; ambient mode (#3)
   once observation precision earns it; demonstration mode (#7) opportunistically.

## 6. Open Questions (next: scoping the v1)

- Target surface order: CLI tools first, then HTTP APIs? What defines "drivable" for v1?
- Local-first vs CI-first launch?
- Launch persona set (proposed: beginner, impatient, hostile, returning) and the model
  tiering per persona.
- Sandbox technology (Docker? microVM? what's the WSL2/macOS story?).
- Report format spec, dedupe/triage rules ("must reproduce twice"), severity model.
- How `possum fix <finding-id>` hands context from persona sandbox to developer agent.
- Is possum v1 a full coding agent + swarm, or swarm-first with fix capability?
