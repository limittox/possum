import { z } from "zod";
import { ClaimObservation, ClaimPage } from "./claimPage.js";
import { TriagedClaim } from "./claimTriage.js";
import { LlmClient } from "../llm/client.js";

export type ClaimVerdict = "fulfilled" | "unfulfilled";

export interface ClaimStep {
  action: "observe" | "click" | "conclude";
  [key: string]: unknown;
}

export interface ClaimVerificationResult {
  claim: TriagedClaim["claim"];
  expectedBehavior: string;
  verdict: ClaimVerdict;
  reason: string;
  steps: ClaimStep[];
}

export interface VerifyClaimInput {
  triaged: TriagedClaim;
  page: ClaimPage;
  llm: LlmClient;
  model: string;
  maxSteps: number;
}

const ActionSchema = z.union([
  z.object({ action: z.literal("click"), text: z.string().min(1) }),
  z.object({
    action: z.literal("conclude"),
    verdict: z.enum(["fulfilled", "unfulfilled"]),
    reason: z.string().min(1)
  })
]);

const SYSTEM_PROMPT =
  "You are a customer checking whether a web app delivers on a specific claim. " +
  "You may click visible link text to navigate. When you are confident, conclude with a verdict. " +
  'Respond with ONLY one JSON object: {"action":"click","text":"..."} or ' +
  '{"action":"conclude","verdict":"fulfilled|unfulfilled","reason":"..."}.';

export async function verifyClaim(input: VerifyClaimInput): Promise<ClaimVerificationResult> {
  const steps: ClaimStep[] = [];

  for (let stepCount = 0; stepCount < input.maxSteps; stepCount += 1) {
    const observation = await input.page.observe();
    steps.push({ action: "observe", url: observation.url, title: observation.title });

    const response = await input.llm.complete({
      model: input.model,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input.triaged, observation)
    });

    const action = parseAction(response.text);
    if (!action) {
      const reason = "Unparseable agent action.";
      steps.push({ action: "conclude", verdict: "unfulfilled", reason });
      return result(input, steps, "unfulfilled", reason);
    }

    if (action.action === "conclude") {
      steps.push({ action: "conclude", verdict: action.verdict, reason: action.reason });
      return result(input, steps, action.verdict, action.reason);
    }

    steps.push({ action: "click", text: action.text });
    await input.page.clickText(action.text);
  }

  const reason = `Agent exhausted ${input.maxSteps} steps (budget) without fulfilling the claim.`;
  steps.push({ action: "conclude", verdict: "unfulfilled", reason });
  return result(input, steps, "unfulfilled", reason);
}

function buildPrompt(triaged: TriagedClaim, observation: ClaimObservation): string {
  return [
    `Claim: ${triaged.claim.text}`,
    `Expected: ${triaged.expectedBehavior}`,
    "",
    `Page title: ${observation.title}`,
    `Headings: ${observation.headings.join(" | ") || "(none)"}`,
    `Links: ${observation.links.map((link) => link.text).join(" | ") || "(none)"}`,
    `Buttons: ${observation.buttons.join(" | ") || "(none)"}`,
    `Body: ${observation.bodyText.slice(0, 500)}`
  ].join("\n");
}

function parseAction(text: string): z.infer<typeof ActionSchema> | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  try {
    return ActionSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}

function result(
  input: VerifyClaimInput,
  steps: ClaimStep[],
  verdict: ClaimVerdict,
  reason: string
): ClaimVerificationResult {
  return { claim: input.triaged.claim, expectedBehavior: input.triaged.expectedBehavior, verdict, reason, steps };
}
