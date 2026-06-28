import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Browser, chromium } from "playwright";
import { createPlaywrightVerificationPage } from "../src/verification/playwrightVerificationPage.js";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

describe("createPlaywrightVerificationPage", () => {
  it("observes visible page controls", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <html>
        <head><title>Reports</title></head>
        <body>
          <h1>Reports</h1>
          <a href="/settings">Settings</a>
          <button>Export CSV</button>
          <label>Email <input name="email" placeholder="you@example.com" /></label>
        </body>
      </html>
    `);

    const verifierPage = createPlaywrightVerificationPage(page);
    const observation = await verifierPage.observe();

    expect(observation.title).toBe("Reports");
    expect(observation.bodyText).toContain("Reports");
    expect(observation.links).toContainEqual({ text: "Settings", href: "/settings" });
    expect(observation.buttons).toContain("Export CSV");
    expect(observation.inputs).toContainEqual({
      label: "Email",
      placeholder: "you@example.com",
      name: "email",
      value: ""
    });

    await page.close();
  });

  it("clickText clicks visible controls", async () => {
    const page = await browser.newPage();
    await page.setContent(`<button onclick="window.clicked = true">Export CSV</button>`);

    const verifierPage = createPlaywrightVerificationPage(page);
    await verifierPage.clickText("Export CSV");

    expect(await page.evaluate(() => (window as unknown as { clicked?: boolean }).clicked)).toBe(true);
    await page.close();
  });

  it("fillField fills by label", async () => {
    const page = await browser.newPage();
    await page.setContent(`<label>Email <input name="email" /></label>`);

    const verifierPage = createPlaywrightVerificationPage(page);
    await verifierPage.fillField("Email", "demo@example.com");

    expect(await page.locator('input[name="email"]').inputValue()).toBe("demo@example.com");
    await page.close();
  });
});
