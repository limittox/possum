import { z } from "zod";
import { LlmClient } from "../llm/client.js";
import {
  FeatureCheckResult,
  FeatureSetupResult,
  VerificationActionRecord,
  VerificationCheck,
  VerificationVerdict
} from "./types.js";

export interface VerificationObservation {
  url: string;
  title: string;
  bodyText: string;
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  inputs: Array<{ label?: string; placeholder?: string; name?: string; value?: string }>;
}

export interface VerificationBrowserPage {
  goto(pathOrUrl: string): Promise<void>;
  observe(): Promise<VerificationObservation>;
  clickText(text: string, options?: { expectDownload?: boolean }): Promise<Record<string, unknown> | undefined>;
  fillField(target: string, value: string): Promise<void>;
  press(key: string): Promise<void>;
}

export interface VerifyFeatureCheckInput {
  check: VerificationCheck;
  page: VerificationBrowserPage;
  llm: LlmClient;
  model: string;
  targetUrl: string;
  maxSteps: number;
  deadline: number;
  now?: () => number;
  onStep?: (step: number) => void;
}

export interface VerifyFeatureSetupInput {
  setup: string[];
  feature: string;
  page: VerificationBrowserPage;
  llm: LlmClient;
  model: string;
  targetUrl: string;
  maxSteps: number;
  deadline: number;
  now?: () => number;
}

const ActionSchema = z.union([
  z.object({ action: z.literal("goto"), path: z.string().min(1) }),
  z.object({ action: z.literal("click"), text: z.string().min(1), expectDownload: z.boolean().optional() }),
  z.object({ action: z.literal("fill"), target: z.string().min(1), value: z.string() }),
  z.object({ action: z.literal("press"), key: z.string().min(1) }),
  z.object({ action: z.literal("wait") }),
  z.object({ action: z.literal("observe") }),
  z.object({
    action: z.literal("conclude"),
    verdict: z.enum(["passed", "failed", "inconclusive"]),
    reason: z.string().min(1)
  })
]);

type VerifierAction = z.infer<typeof ActionSchema>;

const SYSTEM_PROMPT = [
  "You are Possum, a browser-based verifier for coding agents.",
  "Use the browser observation and choose one JSON action.",
  "Allowed actions: goto, click, fill, press, wait, observe, conclude.",
  "Conclude with verdict passed, failed, or inconclusive.",
  "Never navigate outside the same app origin."
].join("\n");

export async function verifyFeatureCheck(input: VerifyFeatureCheckInput): Promise<FeatureCheckResult> {
  const actions: VerificationActionRecord[] = [];
  const now = input.now ?? Date.now;

  for (let step = 1; step <= input.maxSteps; step += 1) {
    if (now() >= input.deadline) {
      return finish(input.check, actions, "inconclusive", "wall-clock budget reached");
    }

    input.onStep?.(step);

    try {
      const observation = await input.page.observe();
      actions.push({ action: "observe", detail: observation.title, url: observation.url });

      const response = await input.llm.complete({
        model: input.model,
        system: SYSTEM_PROMPT,
        prompt: buildCheckPrompt(input.check, observation)
      });
      const action = parseAction(response.text);
      if (!action) {
        actions.push({ action: "invalid-action", detail: response.text });
        continue;
      }

      const concluded = await executeAction({ action, page: input.page, targetUrl: input.targetUrl, actions });
      if (concluded) {
        return finish(input.check, actions, concluded.verdict, concluded.reason);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return finish(input.check, actions, "inconclusive", reason);
    }
  }

  return finish(input.check, actions, "inconclusive", `Step budget exhausted after ${input.maxSteps} steps.`);
}

export async function verifyFeatureSetup(input: VerifyFeatureSetupInput): Promise<FeatureSetupResult> {
  if (input.setup.length === 0) {
    return { status: "skipped", actions: [] };
  }

  const setupCheck: VerificationCheck = {
    id: "setup",
    source: "explicit",
    text: `Complete setup for feature: ${input.feature}. Steps: ${input.setup.join("; ")}`,
    pages: [],
    hints: undefined
  };

  const result = await verifyFeatureCheck({
    check: setupCheck,
    page: input.page,
    llm: input.llm,
    model: input.model,
    targetUrl: input.targetUrl,
    maxSteps: input.maxSteps,
    deadline: input.deadline,
    now: input.now
  });

  if (result.verdict === "passed") {
    return { status: "passed", reason: result.reason, actions: result.actions };
  }

  return { status: "inconclusive", reason: result.reason, actions: result.actions };
}

async function executeAction(input: {
  action: VerifierAction;
  page: VerificationBrowserPage;
  targetUrl: string;
  actions: VerificationActionRecord[];
}): Promise<{ verdict: VerificationVerdict; reason: string } | undefined> {
  switch (input.action.action) {
    case "goto": {
      if (!isSameOriginNavigation(input.targetUrl, input.action.path)) {
        input.actions.push({ action: "blocked-navigation", detail: input.action.path });
        return undefined;
      }
      await input.page.goto(input.action.path);
      input.actions.push({ action: "goto", detail: input.action.path });
      return undefined;
    }
    case "click": {
      const evidence = await input.page.clickText(input.action.text, { expectDownload: input.action.expectDownload });
      input.actions.push({ action: "click", detail: input.action.text, evidence });
      return undefined;
    }
    case "fill":
      await input.page.fillField(input.action.target, input.action.value);
      input.actions.push({ action: "fill", detail: input.action.target, evidence: { value: input.action.value } });
      return undefined;
    case "press":
      await input.page.press(input.action.key);
      input.actions.push({ action: "press", detail: input.action.key });
      return undefined;
    case "wait":
      await new Promise((resolve) => setTimeout(resolve, 250));
      input.actions.push({ action: "wait", detail: "250ms" });
      return undefined;
    case "observe":
      input.actions.push({ action: "observe-requested", detail: "LLM requested another observation" });
      return undefined;
    case "conclude":
      input.actions.push({ action: "conclude", detail: input.action.reason, evidence: { verdict: input.action.verdict } });
      return { verdict: input.action.verdict, reason: input.action.reason };
  }
}

function parseAction(text: string): VerifierAction | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    return undefined;
  }

  try {
    return ActionSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}

function buildCheckPrompt(check: VerificationCheck, observation: VerificationObservation): string {
  return JSON.stringify(
    {
      check: { text: check.text, source: check.source, pages: check.pages, hints: check.hints },
      observation
    },
    null,
    2
  );
}

function finish(
  check: VerificationCheck,
  actions: VerificationActionRecord[],
  verdict: VerificationVerdict,
  reason: string
): FeatureCheckResult {
  return { id: check.id, source: check.source, text: check.text, verdict, reason, actions };
}

function isSameOriginNavigation(targetUrl: string, pathOrUrl: string): boolean {
  const base = new URL(targetUrl);
  const destination = new URL(pathOrUrl, base);
  return destination.origin === base.origin;
}
