import { z } from "zod";
import { GitDiffSummary } from "../diff/gitDiff.js";
import { LlmClient } from "../llm/client.js";
import { FeatureCheckBriefSchema, FeatureVerificationBrief, FeatureVerificationBriefSchema } from "./types.js";

export class DiffBriefInferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffBriefInferenceError";
  }
}

export interface InferFeatureBriefFromDiffInput {
  diff: GitDiffSummary;
  llm: LlmClient;
  model: string;
  maxDiffChars?: number;
}

const DiffFeatureVerificationBriefSchema = FeatureVerificationBriefSchema.extend({
  checks: z.array(FeatureCheckBriefSchema).min(1)
});

const SYSTEM_PROMPT = [
  "You are Possum, a browser-based app verifier for coding agents.",
  "Infer the user-facing feature that changed from a git diff.",
  "Return ONLY a JSON object shaped as {\"feature\": string, \"pages\": string[], \"setup\": string[], \"checks\": [{\"text\": string, \"hints\"?: object}] }.",
  "Each check must be verifiable by using the app in a browser.",
  "Do not include source-code, API-only, database, unit-test, or implementation-detail checks.",
  "Prefer 1 to 3 high-signal checks."
].join("\n");

export async function inferFeatureBriefFromDiff(input: InferFeatureBriefFromDiffInput): Promise<FeatureVerificationBrief> {
  const response = await input.llm.complete({
    model: input.model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input.diff, input.maxDiffChars ?? 24_000)
  });

  try {
    return DiffFeatureVerificationBriefSchema.parse(JSON.parse(response.text));
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("; ") : error instanceof Error ? error.message : String(error);
    throw new DiffBriefInferenceError(`Could not infer feature brief from git diff: ${message}`);
  }
}

function buildPrompt(diff: GitDiffSummary, maxDiffChars: number): string {
  return [
    `Diff source: ${diff.source}${diff.base ? ` (${diff.base})` : ""}`,
    "Changed files:",
    ...diff.changedFiles.map((file) => `- ${file}`),
    "",
    "Git diff:",
    truncateDiff(diff.diff, maxDiffChars),
    "",
    "Infer the smallest useful feature verification brief for the customer-visible behavior changed by this diff."
  ].join("\n");
}

function truncateDiff(diff: string, maxDiffChars: number): string {
  if (diff.length <= maxDiffChars) {
    return diff;
  }
  return `${diff.slice(0, maxDiffChars)}\n[diff truncated at ${maxDiffChars} characters]`;
}
