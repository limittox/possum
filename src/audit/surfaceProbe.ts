import { PageSurface, PageSurfaceSchema } from "../contracts/surface.js";

export interface ProbeTargetSurfaceInput {
  targetUrl: string;
}

export async function probeTargetSurface(input: ProbeTargetSurfaceInput): Promise<PageSurface> {
  const response = await fetch(input.targetUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`Target returned HTTP ${response.status}`);
  }

  const html = await response.text();
  return PageSurfaceSchema.parse({
    targetUrl: input.targetUrl,
    finalUrl: response.url,
    status: response.status,
    ...extractSurfaceFromHtml(html)
  });
}

function extractSurfaceFromHtml(html: string): Omit<PageSurface, "targetUrl" | "finalUrl" | "status"> {
  return {
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    headings: allMatches(html, /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi).map(cleanText).filter(Boolean),
    links: extractLinks(html),
    buttons: allMatches(html, /<button\b[^>]*>([\s\S]*?)<\/button>/gi).map(cleanText).filter(Boolean),
    forms: extractForms(html)
  };
}

function extractLinks(html: string): Array<{ text: string; href: string }> {
  return Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))
    .map((match) => ({
      text: cleanText(match[2] ?? ""),
      href: getAttribute(match[1] ?? "", "href") ?? ""
    }))
    .filter((link) => link.text.length > 0 || link.href.length > 0);
}

function extractForms(html: string): Array<{ action?: string; method: string; inputs: string[] }> {
  return Array.from(html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)).map((match) => {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const action = getAttribute(attrs, "action");
    const method = getAttribute(attrs, "method")?.toLowerCase() ?? "get";
    const inputs = Array.from(body.matchAll(/<(?:input|textarea|select)\b([^>]*)>/gi))
      .map((inputMatch) => getAttribute(inputMatch[1] ?? "", "name"))
      .filter((name): name is string => Boolean(name));

    return action ? { action, method, inputs } : { method, inputs };
  });
}

function firstMatch(input: string, pattern: RegExp): string {
  return cleanText(input.match(pattern)?.[1] ?? "");
}

function allMatches(input: string, pattern: RegExp): string[] {
  return Array.from(input.matchAll(pattern)).map((match) => match[1] ?? "");
}

function getAttribute(attrs: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return attrs.match(pattern)?.[1];
}

function cleanText(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
