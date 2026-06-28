import { z } from "zod";
import { LlmClient } from "../llm/client.js";
import { FeatureCheckBrief, FeatureCheckBriefSchema, FeatureVerificationBrief } from "./types.js";

export class FeatureCheckInferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureCheckInferenceError";
  }
}

export interface InferFeatureChecksInput {
  brief: FeatureVerificationBrief;
  llm: LlmClient;
  model: string;
  maxChecks?: number;
}

const InferredChecksSchema = z.array(FeatureCheckBriefSchema).min(1);

const SYSTEM_PROMPT = [
  "You are Possum, a browser-based app verifier for coding agents.",
  "Infer a small set of customer-visible checks for a completed feature.",
  "Return ONLY a JSON array of objects shaped as {\"text\": string, \"hints\"?: object}.",
  "Do not include code assertions, database checks, API checks, or source-code checks.",
  "Prefer checks a user can verify in the browser."
].join("\n");

export async function inferFeatureChecks(input: InferFeatureChecksInput): Promise<FeatureCheckBrief[]> {
  const response = await input.llm.complete({
    model: input.model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input.brief)
  });

  try {
    const parsed = InferredChecksSchema.parse(JSON.parse(response.text));
    return parsed.slice(0, input.maxChecks ?? 3);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FeatureCheckInferenceError(`Could not infer feature checks: ${message}`);
  }
}

function buildPrompt(brief: FeatureVerificationBrief): string {
  return [
    `Feature: ${brief.feature}`,
    `Pages: ${brief.pages.length > 0 ? brief.pages.join(", ") : "none provided"}`,
    `Setup: ${brief.setup.length > 0 ? brief.setup.join("; ") : "none provided"}`,
    "Infer up to 3 browser-visible acceptance checks."
  ].join("\n");
}
