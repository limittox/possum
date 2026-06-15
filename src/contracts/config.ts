import { z } from "zod";

export const PersonaSchema = z.enum(["beginner", "impatient", "hostile", "returning"]);

export const PossumConfigSchema = z.object({
  target: z.object({
    url: z.string().url(),
    command: z.string().optional()
  }),
  personas: z.array(PersonaSchema).default(["beginner", "impatient", "hostile"]),
  budgets: z
    .object({
      maxStepsPerPersona: z.number().int().positive().default(30),
      maxMinutesPerPersona: z.number().int().positive().default(5)
    })
    .default({ maxStepsPerPersona: 30, maxMinutesPerPersona: 5 }),
  models: z
    .object({
      provider: z.enum(["anthropic", "openai"]),
      personaModel: z.string(),
      judgeModel: z.string().optional()
    })
    .optional()
});

export type Persona = z.infer<typeof PersonaSchema>;
export type PossumConfig = z.infer<typeof PossumConfigSchema>;
