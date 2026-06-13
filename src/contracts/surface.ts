import { z } from "zod";

export const LinkSurfaceSchema = z.object({
  text: z.string(),
  href: z.string()
});

export const FormSurfaceSchema = z.object({
  action: z.string().optional(),
  method: z.string(),
  inputs: z.array(z.string())
});

export const PageSurfaceSchema = z.object({
  targetUrl: z.string().url(),
  finalUrl: z.string().url(),
  status: z.number().int(),
  title: z.string(),
  headings: z.array(z.string()),
  links: z.array(LinkSurfaceSchema),
  buttons: z.array(z.string()),
  forms: z.array(FormSurfaceSchema),
  screenshot: z.string().optional()
});

export type LinkSurface = z.infer<typeof LinkSurfaceSchema>;
export type FormSurface = z.infer<typeof FormSurfaceSchema>;
export type PageSurface = z.infer<typeof PageSurfaceSchema>;
