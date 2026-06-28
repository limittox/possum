import { z } from "zod";

export const PersonaSchema = z.enum(["beginner", "impatient", "hostile", "returning", "claims", "feature"]);

export const PossumConfigSchema = z.object({
  target: z.object({
    url: z.string().url(),
    command: z.string().optional()
  }),
  personas: z.array(PersonaSchema).default(["beginner", "impatient", "hostile"]),
  budgets: z
    .object({
      maxStepsPerPersona: z.number().int().positive().default(30),
      maxMinutesPerPersona: z.number().int().positive().default(5),
      requestTimeoutSeconds: z.number().int().positive().default(60)
    })
    .default({ maxStepsPerPersona: 30, maxMinutesPerPersona: 5, requestTimeoutSeconds: 60 }),
  models: z
    .object({
      provider: z.enum(["anthropic", "openai", "openrouter"]),
      personaModel: z.string(),
      judgeModel: z.string().optional()
    })
    .optional()
});

export type Persona = z.infer<typeof PersonaSchema>;
export type PossumConfig = z.infer<typeof PossumConfigSchema>;
