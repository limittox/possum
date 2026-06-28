# Debugging Bundle MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a practical per-finding debugging bundle that writes `debug.json`, `repair-hints.md`, and a Debugging Bundle section in each finding report.

**Architecture:** Derive the bundle from existing finding metadata, existing trace data, and existing repro path. Keep browser observability capture out of scope for this MVP. Add a focused module that builds machine-readable debug bundles and renders repair hints, then wire it into `writeFindingArtifacts`.

**Tech Stack:** TypeScript, Node.js filesystem APIs, existing Possum finding/run-store contracts, Vitest.

## Global Constraints

- Work inline in `/home/yathu/code/possum`; do not create a worktree.
- Do not add browser console/network/HAR/trace.zip capture in this MVP.
- Generate deterministic repair hints; do not call an LLM.
- Preserve existing artifact paths: `report.md`, `trace.json`, `repro.spec.ts`.
- Add new artifacts to every confirmed finding directory: `debug.json`, `repair-hints.md`.
- Keep output plain-file and coding-agent friendly.

---

## File Structure

- Create `src/debug/debugBundle.ts`
  - Owns debug bundle construction and repair-hints Markdown rendering.
  - Exports `createDebugBundle()` and `renderRepairHintsMarkdown()`.

- Modify `src/report/renderMarkdown.ts`
  - Adds a Debugging Bundle section to per-finding `report.md`.

- Modify `src/runs/runStore.ts`
  - Writes `debug.json` and `repair-hints.md` alongside existing finding artifacts.

- Add `tests/debugBundle.test.ts`
  - Unit tests for bundle shape and deterministic repair hints.

- Extend `tests/runStore.test.ts`
  - Integration test that `writeFindingArtifacts()` writes the new files and updated report.

---

### Task 1: Debug Bundle Module

**Files:**
- Create: `src/debug/debugBundle.ts`
- Test: `tests/debugBundle.test.ts`

**Interfaces:**
- Produces:
  - `interface DebugBundleArtifactPaths`
  - `interface DebugTimelineEntry`
  - `interface FindingDebugBundle`
  - `function createDebugBundle(input: CreateDebugBundleInput): FindingDebugBundle`
  - `function renderRepairHintsMarkdown(bundle: FindingDebugBundle): string`

- [ ] **Step 1: Write failing tests**

Create tests for:

- hostile server error hint mentions validation/error handling.
- impatient double submit hint mentions duplicate submission guard/idempotency.
- feature finding hint mentions rerunning feature or diff verification.
- timeline preserves action objects from trace when `trace.actions` exists.

- [ ] **Step 2: Run red tests**

```bash
npm test -- tests/debugBundle.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement module**

Implement deterministic bundle and Markdown renderer.

- [ ] **Step 4: Run green tests**

```bash
npm test -- tests/debugBundle.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/debug/debugBundle.ts tests/debugBundle.test.ts
git commit -m "feat: create finding debug bundle"
```

---

### Task 2: Artifact Writing Integration

**Files:**
- Modify: `src/runs/runStore.ts`
- Modify: `src/report/renderMarkdown.ts`
- Test: `tests/runStore.test.ts`

**Interfaces:**
- Consumes `createDebugBundle()` and `renderRepairHintsMarkdown()` from Task 1.
- Extends `writeFindingArtifacts()` to write:
  - `debug.json`
  - `repair-hints.md`
  - `report.md` with a Debugging Bundle section.

- [ ] **Step 1: Write failing integration test**

Extend `tests/runStore.test.ts` to assert that a finding directory contains:

- `debug.json`
- `repair-hints.md`
- `report.md` section `## Debugging Bundle`

- [ ] **Step 2: Run red test**

```bash
npm test -- tests/runStore.test.ts
```

Expected: fail because files/section do not exist.

- [ ] **Step 3: Implement integration**

Update `writeFindingArtifacts()` to generate and write bundle files. Update `renderFindingMarkdown()` to include a static Debugging Bundle artifact list.

- [ ] **Step 4: Run green test**

```bash
npm test -- tests/runStore.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/runs/runStore.ts src/report/renderMarkdown.ts tests/runStore.test.ts
git commit -m "feat: write debugging bundle artifacts"
```

---

### Task 3: Documentation and Verification

**Files:**
- Modify: `README.md`
- Optional modify: `CHANGELOG.md` under Unreleased if present; otherwise skip.

- [ ] **Step 1: Update README**

Mention `debug.json` and `repair-hints.md` in the artifact list.

- [ ] **Step 2: Run full verification**

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe debugging bundle artifacts"
```
