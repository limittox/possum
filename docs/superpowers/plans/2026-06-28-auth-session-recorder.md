# Auth Session Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `possum auth record` and authenticated verification using Playwright storage state.

**Architecture:** Add config support for `auth.storageState`, a focused auth recorder module that saves Playwright storage state, and thread an optional `storageState` path through audit, app verification, feature verification, diff verification, and MCP handlers. Keep recording CLI-only because it is interactive.

**Tech Stack:** TypeScript, Playwright storage state, Commander CLI, Zod config schema, Vitest.

## Global Constraints

- Work inline in `/home/yathu/code/possum`; do not create a worktree.
- Auth recording is CLI-only for MVP; do not add MCP `auth_record`.
- Auth state is sensitive and must be ignored by git using `.possum/auth/`.
- Default auth profile path is `.possum/auth/default.json`.
- Named auth profile path is `.possum/auth/<name>.json` where name contains only letters, numbers, `_`, `-`, or `.`.
- Verification commands should use configured auth state automatically.
- Add optional `--auth <profile-or-path>` for CLI verification commands.
- Do not store passwords or prompt for credentials; user logs in manually in a headed browser.

---

## File Structure

- Create `src/auth/sessionRecorder.ts`
  - Records Playwright storage state after manual login.
  - Exports helpers for default/named auth paths.

- Modify `src/contracts/config.ts`
  - Add optional `auth.storageState` schema.

- Modify `src/config/appConfig.ts`
  - Resolve configured auth storage state.
  - Resolve CLI `--auth` overrides.
  - Update starter gitignore behavior to include `.possum/auth/`.
  - Add helper to update config after default recording.

- Modify browser execution files:
  - `src/audit/audit.ts`
  - `src/audit/surfaceProbe.ts`
  - `src/audit/impatientProbe.ts`
  - `src/audit/hostileProbe.ts`
  - `src/verification/featureVerification.ts`

- Modify integration surfaces:
  - `src/cli/main.ts`
  - `src/mcp/server.ts`

- Tests:
  - `tests/authSessionRecorder.test.ts`
  - extend `tests/configContract.test.ts`
  - extend `tests/configCli.test.ts`
  - extend `tests/cli.test.ts`
  - extend `tests/mcpHandlers.test.ts`
  - add or extend a Playwright probe test for storage state usage.

---

### Task 1: Config and Gitignore Support

**Files:**
- Modify: `src/contracts/config.ts`
- Modify: `src/config/appConfig.ts`
- Modify: `tests/configContract.test.ts`
- Modify: `tests/configCli.test.ts`

**Interfaces:**
- Add `auth?: { storageState: string }` to config.
- Add `authStorageState?: string` to `ResolvedAuditTarget`.
- Add `resolveAuthStorageState(rootDir, configured, override?)` behavior through `resolveAuditTarget`.
- `.gitignore` created by `possum init` contains both `.possum/runs/` and `.possum/auth/`.

**TDD Steps:**
1. Write tests for config schema and resolved auth path.
2. Write tests for init gitignore including `.possum/auth/` and no duplicates.
3. Run focused tests and watch them fail.
4. Implement schema and gitignore changes.
5. Run focused tests and commit.

---

### Task 2: Auth Session Recorder Module

**Files:**
- Create: `src/auth/sessionRecorder.ts`
- Test: `tests/authSessionRecorder.test.ts`

**Interfaces:**
- `getAuthStorageStatePath(rootDir: string, name?: string): string`
- `recordAuthSession(input: RecordAuthSessionInput): Promise<RecordAuthSessionResult>`
- `updateDefaultAuthConfig(rootDir: string, storageStatePath: string): Promise<boolean>`

**TDD Steps:**
1. Write tests using a fake browser/context/page and fake wait function.
2. Validate default and named auth path behavior.
3. Validate invalid auth names reject slashes and path traversal.
4. Validate recording calls `storageState({ path })` after navigation and wait.
5. Implement module.
6. Run tests and commit.

---

### Task 3: Thread Storage State Through Verification Engines

**Files:**
- Modify: `src/audit/audit.ts`
- Modify: `src/audit/surfaceProbe.ts`
- Modify: `src/audit/impatientProbe.ts`
- Modify: `src/audit/hostileProbe.ts`
- Modify: `src/verification/featureVerification.ts`
- Test: storage-state Playwright probe test and existing tests.

**Interfaces:**
- Add `storageState?: string` to `AuditInput`, probe inputs, and `RunFeatureVerificationInput`.
- Use `browser.newPage({ viewport, storageState })` wherever Possum creates a browser page.

**TDD Steps:**
1. Add test proving `probeTargetSurface` can load an authenticated page using a Playwright storage state file.
2. Run test and watch it fail.
3. Implement storage-state support in probes/audit/feature verification.
4. Run focused tests and commit.

---

### Task 4: CLI Auth Command and Verification Flags

**Files:**
- Modify: `src/cli/main.ts`
- Test: `tests/cli.test.ts`, `tests/configCli.test.ts`

**Interfaces:**
- New command: `possum auth record [--name <name>] [--url <url>] [--command <command>]`.
- Verification flags: `--auth <profile-or-path>` for `audit`, `verify-app`, `verify-feature`, `verify-diff`.
- CLI dependency injection: `recordAuthSessionImpl?: typeof recordAuthSession`.

**TDD Steps:**
1. Add CLI tests for `auth record` using injected recorder.
2. Add CLI tests proving `verify-app --auth admin` passes `.possum/auth/admin.json` to `verifyAppImpl`.
3. Add CLI tests proving configured `auth.storageState` is passed to `verifyFeatureImpl`.
4. Run focused tests and watch them fail.
5. Implement CLI command and flags.
6. Run focused tests and commit.

---

### Task 5: MCP Uses Configured Auth State

**Files:**
- Modify: `src/mcp/server.ts`
- Test: `tests/mcpHandlers.test.ts`

**Interfaces:**
- MCP verification tools use `target.authStorageState` automatically.
- No MCP auth recording tool in MVP.

**TDD Steps:**
1. Add tests proving `verify_app`, `verify_feature`, and `verify_diff` injected implementations receive `storageState` from config.
2. Run focused tests and watch them fail.
3. Implement MCP storage-state passing.
4. Run focused tests and commit.

---

### Task 6: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Possibly modify agent docs if concise guidance is needed.

**TDD/Verification Steps:**
1. Document `possum auth record` and auth state gitignore behavior.
2. Run:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `git diff --check`
3. Commit docs.
