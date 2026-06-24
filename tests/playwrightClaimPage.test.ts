import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, Browser } from "playwright";
import { createPlaywrightClaimPage } from "../src/audit/playwrightClaimPage.js";

let server: Server;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(
      '<html><head><title>Home</title></head><body><h1>Welcome</h1><a href="/x">Reports</a><button>Go</button></body></html>'
    );
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("playwright claim page", () => {
  it("observes a real page through the ClaimPage interface", async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const claimPage = createPlaywrightClaimPage(page);

    const observation = await claimPage.observe();
    expect(observation.title).toBe("Home");
    expect(observation.headings).toContain("Welcome");
    expect(observation.links.map((link) => link.text)).toContain("Reports");
    expect(observation.buttons).toContain("Go");

    await page.close();
  });
});
