import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { PageSurface, PageSurfaceSchema } from "../contracts/surface.js";

export interface ProbeTargetSurfaceInput {
  targetUrl: string;
  screenshot?: {
    absolutePath: string;
    relativePath: string;
  };
}

export async function probeTargetSurface(input: ProbeTargetSurfaceInput): Promise<PageSurface> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    const response = await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });

    if (!response) {
      throw new Error("Target did not return a response");
    }

    if (!response.ok()) {
      throw new Error(`Target returned HTTP ${response.status()}`);
    }

    if (input.screenshot) {
      await mkdir(dirname(input.screenshot.absolutePath), { recursive: true });
      await page.screenshot({ path: input.screenshot.absolutePath, fullPage: true });
    }

    const surface = await page.evaluate(() => {
      const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

      return {
        title: document.title.trim(),
        headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
          .map((element) => text(element.textContent))
          .filter(Boolean),
        links: Array.from(document.querySelectorAll("a"))
          .map((element) => ({
            text: text(element.textContent),
            href: element.getAttribute("href") ?? ""
          }))
          .filter((link) => link.text.length > 0 || link.href.length > 0),
        buttons: Array.from(document.querySelectorAll("button"))
          .map((element) => text(element.textContent))
          .filter(Boolean),
        forms: Array.from(document.querySelectorAll("form")).map((form) => ({
          action: form.getAttribute("action") || undefined,
          method: (form.getAttribute("method") || "get").toLowerCase(),
          inputs: Array.from(form.querySelectorAll("input,textarea,select"))
            .map((element) => element.getAttribute("name") ?? "")
            .filter(Boolean)
        }))
      };
    });

    return PageSurfaceSchema.parse({
      targetUrl: input.targetUrl,
      finalUrl: page.url(),
      status: response.status(),
      ...surface,
      screenshot: input.screenshot?.relativePath
    });
  } finally {
    await browser.close();
  }
}
