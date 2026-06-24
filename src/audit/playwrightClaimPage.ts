import { Page } from "playwright";
import { ClaimObservation, ClaimPage } from "./claimPage.js";

export function createPlaywrightClaimPage(page: Page): ClaimPage {
  return {
    async observe(): Promise<ClaimObservation> {
      const data = await page.evaluate(() => {
        const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        return {
          title: document.title.trim(),
          headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
            .map((element) => text(element.textContent))
            .filter(Boolean),
          links: Array.from(document.querySelectorAll("a"))
            .map((element) => ({ text: text(element.textContent), href: element.getAttribute("href") ?? "" }))
            .filter((link) => link.text.length > 0),
          buttons: Array.from(document.querySelectorAll("button"))
            .map((element) => text(element.textContent))
            .filter(Boolean),
          bodyText: text(document.body?.innerText)
        };
      });
      return { url: page.url(), ...data };
    },

    async clickText(linkText: string): Promise<void> {
      const locator = page.locator(`a:has-text("${linkText.replace(/"/g, '\\"')}")`).first();
      try {
        await Promise.all([
          page.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => undefined),
          locator.click({ timeout: 2000 })
        ]);
      } catch {
        // Missing or non-navigating link: leave the page where it is.
      }
    }
  };
}
