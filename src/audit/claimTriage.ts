import { z } from "zod";
import { ClaimSurface } from "../contracts/surface.js";
import { LlmClient } from "../llm/client.js";

export interface TriagedClaim {
  claim: ClaimSurface;
  expectedBehavior: string;
}

export interface TriageClaimsInput {
  claims: ClaimSurface[];
  llm: LlmClient;
  model: string;
}

const TriageResponseSchema = z.array(
  z.object({
    index: z.number().int().nonnegative(),
    verifiable: z.boolean(),
    expectedBehavior: z.string().default("")
  })
);

const SYSTEM_PROMPT =
  "You decide whether a claim a web app makes about itself can be verified by a customer using the app's UI. " +
  "A claim is verifiable when fulfilling it requires a visible control or flow (a button, link, or form). " +
  "A claim is not verifiable when it describes licensing, pricing, internals, or anything not exercised through the UI.";

export async function triageClaims(input: TriageClaimsInput): Promise<TriagedClaim[]> {
  if (input.claims.length === 0) {
    return [];
  }

  const prompt = [
    "Classify each claim. Respond with ONLY a JSON array of objects:",
    '[{ "index": number, "verifiable": boolean, "expectedBehavior": string }]',
    "expectedBehavior describes, in one sentence, what a customer should be able to do if the claim holds.",
    "",
    "Claims:",
    ...input.claims.map((claim, index) => `${index}. (${claim.source}) ${claim.text}`)
  ].join("\n");

  const response = await input.llm.complete({ model: input.model, system: SYSTEM_PROMPT, prompt });

  const parsed = parseTriageResponse(response.text);
  if (!parsed) {
    return [];
  }

  const triaged: TriagedClaim[] = [];
  for (const entry of parsed) {
    const claim = input.claims[entry.index];
    if (claim && entry.verifiable && entry.expectedBehavior.trim().length > 0) {
      triaged.push({ claim, expectedBehavior: entry.expectedBehavior.trim() });
    }
  }
  return triaged;
}

function parseTriageResponse(text: string): z.infer<typeof TriageResponseSchema> | undefined {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }

  try {
    return TriageResponseSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}
