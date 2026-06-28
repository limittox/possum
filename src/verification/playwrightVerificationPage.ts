import { Page } from "playwright";
import { VerificationBrowserPage, VerificationObservation } from "./browserVerifier.js";

export function createPlaywrightVerificationPage(page: Page): VerificationBrowserPage {
  return {
    async goto(pathOrUrl: string): Promise<void> {
      await page.goto(pathOrUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
    },

    async observe(): Promise<VerificationObservation> {
      const [title, bodyText, links, buttons, inputs] = await Promise.all([
        page.title(),
        page.locator("body").innerText({ timeout: 1000 }).catch(() => ""),
        page.locator("a").evaluateAll((nodes) =>
          nodes.map((node) => ({
            text: (node.textContent ?? "").trim(),
            href: node.getAttribute("href") ?? ""
          }))
        ),
        page.locator("button, input[type='button'], input[type='submit'], [role='button']").evaluateAll((nodes) =>
          nodes
            .map((node) =>
              (node.textContent ?? node.getAttribute("value") ?? node.getAttribute("aria-label") ?? "").trim()
            )
            .filter(Boolean)
        ),
        page.locator("input, textarea, select").evaluateAll((nodes) =>
          nodes.map((node) => {
            const id = node.getAttribute("id");
            const label = id
              ? (document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? "").trim()
              : (node.closest("label")?.textContent ?? "").trim();
            return {
              label: label || undefined,
              placeholder: node.getAttribute("placeholder") ?? undefined,
              name: node.getAttribute("name") ?? undefined,
              value: (node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? ""
            };
          })
        )
      ]);

      return {
        url: page.url(),
        title,
        bodyText,
        links: links.filter((link) => link.text.length > 0 || link.href.length > 0),
        buttons,
        inputs
      };
    },

    async clickText(text: string, options?: { expectDownload?: boolean }): Promise<Record<string, unknown> | undefined> {
      const locator = page.getByText(text, { exact: true }).first();
      if (options?.expectDownload) {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 5000 }),
          locator.click({ timeout: 5000 })
        ]);
        return { downloadSuggestedFilename: download.suggestedFilename() };
      }
      await locator.click({ timeout: 5000 });
      return undefined;
    },

    async fillField(target: string, value: string): Promise<void> {
      await page.getByLabel(target).or(page.getByPlaceholder(target)).first().fill(value, { timeout: 5000 });
    },

    async press(key: string): Promise<void> {
      await page.keyboard.press(key);
    }
  };
}
