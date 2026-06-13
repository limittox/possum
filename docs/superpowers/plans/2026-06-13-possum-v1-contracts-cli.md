# Possum v1 Contracts And CLI Skeleton Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Possum slice: a TypeScript CLI with documented local run contracts, `.possum/runs/<id>` file layout, report rendering, replay command plumbing, and an MCP server shell that wraps the same core.

**Architecture:** Use a small TypeScript core package shared by the CLI and MCP server. Keep contracts in `src/contracts/`, file-system run storage in `src/runs/`, CLI commands in `src/cli/`, and MCP wrappers in `src/mcp/`. The first slice does not implement browser automation or persona reasoning; it makes the product surface executable and testable so later tasks can plug in Playwright, personas, and the judge.

**Tech Stack:** Node.js 20+, TypeScript, Vitest, Zod for runtime schemas, Commander for CLI parsing, `@modelcontextprotocol/sdk` for MCP, Playwright as a dev dependency reserved for generated repro compatibility.

---

## File Structure

- Create: `package.json` - npm scripts, dependencies, CLI binary entry.
- Create: `tsconfig.json` - strict TypeScript config for `src` and `tests`.
- Create: `vitest.config.ts` - test config.
- Create: `src/index.ts` - public exports for core modules.
- Create: `src/contracts/config.ts` - `possum.toml`-equivalent config schema, represented as JSON-compatible data for v1.
- Create: `src/contracts/findings.ts` - finding, persona, severity, and run report schemas.
- Create: `src/runs/runStore.ts` - read/write helpers for `.possum/runs/<id>`.
- Create: `src/report/renderMarkdown.ts` - Markdown renderer for run reports and findings.
- Create: `src/replay/replayCommand.ts` - validates and returns replay command metadata for generated repros.
- Create: `src/audit/auditStub.ts` - creates a deterministic stub run using the real contracts.
- Create: `src/cli/main.ts` - `possum audit`, `possum report`, `possum replay`, `possum mcp`.
- Create: `src/mcp/server.ts` - MCP tool definitions wrapping core commands.
- Create: `tests/contracts.test.ts` - schema validation tests.
- Create: `tests/runStore.test.ts` - file layout tests.
- Create: `tests/cli.test.ts` - command behavior tests.
- Create: `tests/mcp.test.ts` - MCP tool registration tests.
- Modify: `README.md` - add development commands once the CLI exists.

---

## Task 1: Scaffold TypeScript Package

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Add package metadata and scripts**

Create `package.json`:

```json
{
  "name": "possum",
  "version": "0.1.0",
  "description": "Open-source local customer simulator for AI-built apps.",
  "license": "Apache-2.0",
  "type": "module",
  "bin": {
    "possum": "./dist/cli/main.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "commander": "^12.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.15",
    "playwright": "^1.45.3",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Add TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true
  }
});
```

- [ ] **Step 4: Add empty public export**

Create `src/index.ts`:

```ts
export {};
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 6: Verify scaffold**

Run:

```bash
npm run typecheck
npm test
```

Expected: typecheck passes; Vitest exits successfully with no tests or the default no-test pass behavior configured by Vitest.

- [ ] **Step 7: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/index.ts
git commit -m "chore: scaffold TypeScript CLI package"
```

---

## Task 2: Define Core Contracts

**Files:**

- Create: `src/contracts/config.ts`
- Create: `src/contracts/findings.ts`
- Modify: `src/index.ts`
- Test: `tests/contracts.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `tests/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PossumConfigSchema } from "../src/contracts/config.js";
import { FindingSchema, RunReportSchema } from "../src/contracts/findings.js";

describe("PossumConfigSchema", () => {
  it("accepts a minimal localhost audit config", () => {
    const parsed = PossumConfigSchema.parse({
      target: { url: "http://localhost:3000" },
      models: { provider: "anthropic", personaModel: "claude-3-5-haiku-latest" }
    });

    expect(parsed.target.url).toBe("http://localhost:3000");
    expect(parsed.personas).toEqual(["beginner", "impatient", "hostile"]);
  });
});

describe("FindingSchema", () => {
  it("requires reproducible customer evidence", () => {
    const parsed = FindingSchema.parse({
      id: "finding_beginner_onboarding_001",
      runId: "run_20260613_120000",
      persona: "beginner",
      severity: "high",
      confidence: "confirmed",
      mission: "Create the first project from the homepage claim.",
      claim: "Users can create a project in minutes.",
      expected: "A new project is created.",
      actual: "The create button silently does nothing.",
      reproducibility: { status: "reproduced", attempts: 2 },
      evidence: {
        screenshots: ["findings/finding_beginner_onboarding_001/screenshots/step-3.png"],
        trace: "findings/finding_beginner_onboarding_001/trace.json",
        repro: "findings/finding_beginner_onboarding_001/repro.spec.ts"
      },
      dedupeFingerprint: "beginner:create-project:no-op"
    });

    expect(parsed.reproducibility.attempts).toBe(2);
  });
});

describe("RunReportSchema", () => {
  it("accepts a run summary with findings", () => {
    const parsed = RunReportSchema.parse({
      runId: "run_20260613_120000",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-13T02:00:00.000Z",
      completedAt: "2026-06-13T02:01:00.000Z",
      personas: ["beginner"],
      findings: []
    });

    expect(parsed.findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/contracts.test.ts
```

Expected: FAIL because `src/contracts/config.ts` and `src/contracts/findings.ts` do not exist.

- [ ] **Step 3: Implement config schema**

Create `src/contracts/config.ts`:

```ts
import { z } from "zod";

export const PersonaSchema = z.enum(["beginner", "impatient", "hostile", "returning"]);

export const PossumConfigSchema = z.object({
  target: z.object({
    url: z.string().url(),
    runCommand: z.string().optional()
  }),
  personas: z.array(PersonaSchema).default(["beginner", "impatient", "hostile"]),
  budgets: z
    .object({
      maxStepsPerPersona: z.number().int().positive().default(30),
      maxMinutesPerPersona: z.number().int().positive().default(5)
    })
    .default({ maxStepsPerPersona: 30, maxMinutesPerPersona: 5 }),
  models: z.object({
    provider: z.enum(["anthropic", "openai"]),
    personaModel: z.string(),
    judgeModel: z.string().optional()
  })
});

export type Persona = z.infer<typeof PersonaSchema>;
export type PossumConfig = z.infer<typeof PossumConfigSchema>;
```

- [ ] **Step 4: Implement finding schemas**

Create `src/contracts/findings.ts`:

```ts
import { z } from "zod";
import { PersonaSchema } from "./config.js";

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const ConfidenceSchema = z.enum(["candidate", "confirmed"]);

export const FindingSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  persona: PersonaSchema,
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  mission: z.string().min(1),
  claim: z.string().min(1).optional(),
  expected: z.string().min(1),
  actual: z.string().min(1),
  reproducibility: z.object({
    status: z.enum(["not_replayed", "reproduced", "not_reproduced"]),
    attempts: z.number().int().nonnegative()
  }),
  evidence: z.object({
    screenshots: z.array(z.string()),
    trace: z.string().min(1),
    repro: z.string().min(1)
  }),
  dedupeFingerprint: z.string().min(1)
});

export const RunReportSchema = z.object({
  runId: z.string().min(1),
  targetUrl: z.string().url(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  personas: z.array(PersonaSchema),
  findings: z.array(FindingSchema)
});

export type Severity = z.infer<typeof SeveritySchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type RunReport = z.infer<typeof RunReportSchema>;
```

- [ ] **Step 5: Export contracts**

Modify `src/index.ts`:

```ts
export * from "./contracts/config.js";
export * from "./contracts/findings.js";
```

- [ ] **Step 6: Run contract tests**

Run:

```bash
npm test -- tests/contracts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit contracts**

```bash
git add src/contracts src/index.ts tests/contracts.test.ts
git commit -m "feat: define Possum run and finding contracts"
```

---

## Task 3: Implement Run Store File Layout

**Files:**

- Create: `src/runs/runStore.ts`
- Modify: `src/index.ts`
- Test: `tests/runStore.test.ts`

- [ ] **Step 1: Write failing run store tests**

Create `tests/runStore.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunStore, writeRunReport } from "../src/runs/runStore.js";

describe("run store", () => {
  it("writes findings.json and report.md under .possum/runs/<id>", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-run-store-"));
    const store = createRunStore(root);

    const written = await writeRunReport(store, {
      runId: "run_20260613_120000",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-13T02:00:00.000Z",
      completedAt: "2026-06-13T02:01:00.000Z",
      personas: ["beginner"],
      findings: []
    });

    expect(written.runDir.endsWith(".possum/runs/run_20260613_120000")).toBe(true);
    await expect(readFile(join(written.runDir, "findings.json"), "utf8")).resolves.toContain(
      "\"runId\": \"run_20260613_120000\""
    );
    await expect(readFile(join(written.runDir, "report.md"), "utf8")).resolves.toContain(
      "# Possum Audit run_20260613_120000"
    );
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/runStore.test.ts
```

Expected: FAIL because `src/runs/runStore.ts` does not exist.

- [ ] **Step 3: Implement run store**

Create `src/runs/runStore.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RunReport, RunReportSchema } from "../contracts/findings.js";
import { renderRunMarkdown } from "../report/renderMarkdown.js";

export interface RunStore {
  rootDir: string;
  possumDir: string;
  runsDir: string;
}

export interface WrittenRun {
  runDir: string;
  findingsJsonPath: string;
  reportMarkdownPath: string;
}

export function createRunStore(rootDir: string): RunStore {
  return {
    rootDir,
    possumDir: join(rootDir, ".possum"),
    runsDir: join(rootDir, ".possum", "runs")
  };
}

export async function writeRunReport(store: RunStore, report: RunReport): Promise<WrittenRun> {
  const parsed = RunReportSchema.parse(report);
  const runDir = join(store.runsDir, parsed.runId);
  const findingsJsonPath = join(runDir, "findings.json");
  const reportMarkdownPath = join(runDir, "report.md");

  await mkdir(runDir, { recursive: true });
  await writeFile(findingsJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await writeFile(reportMarkdownPath, renderRunMarkdown(parsed), "utf8");

  return { runDir, findingsJsonPath, reportMarkdownPath };
}
```

- [ ] **Step 4: Implement Markdown renderer required by run store**

Create `src/report/renderMarkdown.ts`:

```ts
import { Finding, RunReport } from "../contracts/findings.js";

export function renderFindingMarkdown(finding: Finding): string {
  return [
    `# ${finding.id}`,
    "",
    `**Persona:** ${finding.persona}`,
    `**Severity:** ${finding.severity}`,
    `**Confidence:** ${finding.confidence}`,
    "",
    "## Mission",
    finding.mission,
    "",
    "## Expected",
    finding.expected,
    "",
    "## Actual",
    finding.actual,
    "",
    "## Repro",
    `Run: npx playwright test ${finding.evidence.repro}`,
    ""
  ].join("\n");
}

export function renderRunMarkdown(report: RunReport): string {
  const findingLines =
    report.findings.length === 0
      ? ["No confirmed findings."]
      : report.findings.map((finding) => `- ${finding.id} (${finding.persona}, ${finding.severity})`);

  return [
    `# Possum Audit ${report.runId}`,
    "",
    `**Target:** ${report.targetUrl}`,
    `**Started:** ${report.startedAt}`,
    report.completedAt ? `**Completed:** ${report.completedAt}` : undefined,
    `**Personas:** ${report.personas.join(", ")}`,
    "",
    "## Findings",
    ...findingLines,
    ""
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
```

- [ ] **Step 5: Export run store and renderer**

Modify `src/index.ts`:

```ts
export * from "./contracts/config.js";
export * from "./contracts/findings.js";
export * from "./report/renderMarkdown.js";
export * from "./runs/runStore.js";
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- tests/runStore.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit run store**

```bash
git add src/runs src/report src/index.ts tests/runStore.test.ts
git commit -m "feat: write local Possum run reports"
```

---

## Task 4: Add Deterministic Audit Stub

**Files:**

- Create: `src/audit/auditStub.ts`
- Modify: `src/index.ts`
- Test: `tests/auditStub.test.ts`

- [ ] **Step 1: Write failing audit stub test**

Create `tests/auditStub.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAuditStub } from "../src/audit/auditStub.js";

describe("runAuditStub", () => {
  it("creates a valid local run with no findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-audit-"));

    const result = await runAuditStub({
      rootDir: root,
      targetUrl: "http://localhost:3000",
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    expect(result.runId).toBe("run_20260613_020000");
    const json = await readFile(join(root, ".possum", "runs", result.runId, "findings.json"), "utf8");
    expect(json).toContain("\"targetUrl\": \"http://localhost:3000\"");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/auditStub.test.ts
```

Expected: FAIL because `src/audit/auditStub.ts` does not exist.

- [ ] **Step 3: Implement audit stub**

Create `src/audit/auditStub.ts`:

```ts
import { createRunStore, writeRunReport } from "../runs/runStore.js";

export interface AuditStubInput {
  rootDir: string;
  targetUrl: string;
  now?: Date;
}

export interface AuditStubResult {
  runId: string;
  runDir: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
}

export function formatRunId(now: Date): string {
  const iso = now.toISOString();
  return `run_${iso.slice(0, 10).replaceAll("-", "")}_${iso.slice(11, 19).replaceAll(":", "")}`;
}

export async function runAuditStub(input: AuditStubInput): Promise<AuditStubResult> {
  const now = input.now ?? new Date();
  const runId = formatRunId(now);
  const store = createRunStore(input.rootDir);
  const written = await writeRunReport(store, {
    runId,
    targetUrl: input.targetUrl,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    personas: ["beginner", "impatient", "hostile"],
    findings: []
  });

  return {
    runId,
    runDir: written.runDir,
    reportMarkdownPath: written.reportMarkdownPath,
    findingsJsonPath: written.findingsJsonPath
  };
}
```

- [ ] **Step 4: Export audit stub**

Modify `src/index.ts`:

```ts
export * from "./audit/auditStub.js";
export * from "./contracts/config.js";
export * from "./contracts/findings.js";
export * from "./report/renderMarkdown.js";
export * from "./runs/runStore.js";
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/auditStub.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit audit stub**

```bash
git add src/audit src/index.ts tests/auditStub.test.ts
git commit -m "feat: add deterministic audit stub"
```

---

## Task 5: Build CLI Commands

**Files:**

- Create: `src/cli/main.ts`
- Modify: `package.json`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Create `tests/cli.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli/main.js";

describe("CLI", () => {
  it("runs audit and prints the run id", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-"));
    const output: string[] = [];
    const program = buildProgram({
      cwd: root,
      stdout: (line) => output.push(line),
      now: new Date("2026-06-13T02:00:00.000Z")
    });

    await program.parseAsync(["node", "possum", "audit", "--url", "http://localhost:3000"]);

    expect(output.join("\n")).toContain("run_20260613_020000");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/cli.test.ts
```

Expected: FAIL because `src/cli/main.ts` does not exist.

- [ ] **Step 3: Implement CLI**

Create `src/cli/main.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runAuditStub } from "../audit/auditStub.js";

export interface CliDependencies {
  cwd: string;
  stdout: (line: string) => void;
  now?: Date;
}

export function buildProgram(deps: CliDependencies): Command {
  const program = new Command();

  program.name("possum").description("Local customer simulator for AI-built apps.");

  program
    .command("audit")
    .description("Run a local customer audit.")
    .requiredOption("--url <url>", "Local app URL to audit")
    .action(async (options: { url: string }) => {
      const result = await runAuditStub({
        rootDir: deps.cwd,
        targetUrl: options.url,
        now: deps.now
      });

      deps.stdout(`Possum audit created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
    });

  program
    .command("report")
    .description("Print a local run report.")
    .argument("<runId>", "Run id under .possum/runs")
    .action(async (runId: string) => {
      const reportPath = join(deps.cwd, ".possum", "runs", runId, "report.md");
      deps.stdout(await readFile(reportPath, "utf8"));
    });

  program
    .command("replay")
    .description("Print the Playwright command for a finding repro.")
    .argument("<reproPath>", "Path to a generated repro.spec.ts")
    .action((reproPath: string) => {
      deps.stdout(`npx playwright test ${resolve(deps.cwd, reproPath)}`);
    });

  program.command("mcp").description("Start the Possum MCP server.").action(() => {
    deps.stdout("MCP server implementation is available through src/mcp/server.ts");
  });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildProgram({
    cwd: process.cwd(),
    stdout: (line) => console.log(line)
  }).parseAsync(process.argv);
}
```

- [ ] **Step 4: Ensure CLI binary is executable after build**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && node -e \"require('node:fs').chmodSync('dist/src/cli/main.js', 0o755)\"",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "bin": {
    "possum": "./dist/src/cli/main.js"
  }
}
```

Keep the rest of `package.json` unchanged.

- [ ] **Step 5: Run CLI tests**

Run:

```bash
npm test -- tests/cli.test.ts
npm run typecheck
npm run build
```

Expected: PASS and `dist/src/cli/main.js` exists.

- [ ] **Step 6: Commit CLI**

```bash
git add package.json src/cli tests/cli.test.ts
git commit -m "feat: add Possum CLI commands"
```

---

## Task 6: Add MCP Server Shell

**Files:**

- Create: `src/mcp/server.ts`
- Modify: `src/index.ts`
- Test: `tests/mcp.test.ts`

- [ ] **Step 1: Write failing MCP registration test**

Create `tests/mcp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getPossumMcpToolNames } from "../src/mcp/server.js";

describe("Possum MCP server", () => {
  it("exposes coding-agent audit tools", () => {
    expect(getPossumMcpToolNames()).toEqual([
      "run_audit",
      "list_findings",
      "get_finding",
      "replay_finding",
      "get_report"
    ]);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- tests/mcp.test.ts
```

Expected: FAIL because `src/mcp/server.ts` does not exist.

- [ ] **Step 3: Implement MCP tool name contract**

Create `src/mcp/server.ts`:

```ts
export const POSSUM_MCP_TOOL_NAMES = [
  "run_audit",
  "list_findings",
  "get_finding",
  "replay_finding",
  "get_report"
] as const;

export type PossumMcpToolName = (typeof POSSUM_MCP_TOOL_NAMES)[number];

export function getPossumMcpToolNames(): PossumMcpToolName[] {
  return [...POSSUM_MCP_TOOL_NAMES];
}
```

- [ ] **Step 4: Export MCP contract**

Modify `src/index.ts`:

```ts
export * from "./audit/auditStub.js";
export * from "./contracts/config.js";
export * from "./contracts/findings.js";
export * from "./mcp/server.js";
export * from "./report/renderMarkdown.js";
export * from "./runs/runStore.js";
```

- [ ] **Step 5: Run MCP tests**

Run:

```bash
npm test -- tests/mcp.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit MCP shell**

```bash
git add src/mcp src/index.ts tests/mcp.test.ts
git commit -m "feat: define Possum MCP tool surface"
```

---

## Task 7: Document Local Development Commands

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add development section**

Append this section before `## License`:

````md
## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The first runnable slice is intentionally contract-first. `possum audit --url
http://localhost:3000` creates a local `.possum/runs/<id>` report without browser
automation. Browser execution, persona prompts, judging, and Playwright repro
generation plug into the same contracts in later slices.
````

- [ ] **Step 2: Verify Markdown fences**

Run:

```bash
sed -n '1,160p' README.md
```

Expected: README renders with one `Development` section and a closed shell code fence.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 4: Commit docs**

```bash
git add README.md
git commit -m "docs: add local development commands"
```

---

## Task 8: Final Verification For Slice

**Files:**

- No new files.

- [ ] **Step 1: Run all verification commands**

Run:

```bash
npm run typecheck
npm test
npm run build
git status --short
```

Expected:

- TypeScript passes with no errors.
- Vitest passes all tests.
- Build emits `dist/src/cli/main.js`.
- `git status --short` is empty.

- [ ] **Step 2: Smoke-test CLI locally**

Run:

```bash
node dist/src/cli/main.js audit --url http://localhost:3000
```

Expected output includes:

```text
Possum audit created run_
Report:
```

- [ ] **Step 3: Inspect generated files**

Run:

```bash
find .possum -maxdepth 4 -type f | sort
```

Expected output includes:

```text
.possum/runs/<run-id>/findings.json
.possum/runs/<run-id>/report.md
```

- [ ] **Step 4: Remove smoke-test run before commit**

Run:

```bash
rm -rf .possum
git status --short
```

Expected: working tree remains clean.

## Self-Review

- Spec coverage: this plan covers the CLI-first surface, first-class MCP server shell, local run evidence layout, report rendering, replay command plumbing, Apache-2.0 package metadata, and coding-agent callable tool names. It intentionally defers Playwright browser execution, persona reasoning, sandboxing, judge reproducibility, and fixture apps to later implementation plans.
- Incomplete-marker scan: no deferred-work markers remain.
- Type consistency: tests and implementation snippets consistently use `runId`, `targetUrl`, `findings`, `run_audit`, `replay_finding`, `RunReport`, and `Finding`.
