# Changelog

## 0.4.0 - 2026-06-28

### Added

- Enhanced debugging bundle artifacts for findings: `debug.json`, `repair-hints.md`, and report links.
- `possum auth record` browser session recorder for authenticated apps.
- Config support for `auth.storageState` and automatic authenticated verification.
- CLI `--auth <profile-or-path>` support for `audit`, `verify-app`, `verify-feature`, and `verify-diff`.
- MCP verification tools now use configured auth storage state.

### Changed

- `possum init` now ignores both `.possum/runs/` and `.possum/auth/`.
- Browser probes wait more reliably for submitted requests before evaluating findings.

## 0.3.0 - 2026-06-28

### Added

- `possum verify-feature --brief <file>` for model-backed verification of a specific completed feature.
- `possum verify-app` as the primary broad app verification workflow.
- `possum verify-diff` to infer a feature brief from git changes and automatically run feature verification.
- MCP tools `verify_feature`, `verify_app`, and `verify_diff` for coding-agent integrations.
- Feature verification artifacts, including `verification.json`, failed-check findings, and generated `diff-brief.json` for diff verification runs.
- App initialization now adds `.possum/runs/` to `.gitignore`.
- Agent-facing docs for Codex, Claude Code, and generic coding agents.

### Changed

- Repositioned Possum around browser-based app verification for coding agents.
- README now documents when to use `verify-diff`, `verify-feature`, and `verify-app`.
- Claim verification infrastructure failures are reported as inconclusive diagnostics instead of misleading access findings.

### Fixed

- Claim triage/provider failures no longer become `finding_beginner_access_001`.
