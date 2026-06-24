import { describe, expect, it } from "vitest";
import { FakeClaimPage } from "../src/audit/claimPage.js";

describe("FakeClaimPage", () => {
  it("observes the current node and follows clicks by link text", async () => {
    const page = new FakeClaimPage({
      "/": {
        url: "http://app.test/",
        title: "Home",
        headings: ["Welcome"],
        links: [{ text: "Reports", href: "/reports" }],
        buttons: [],
        bodyText: "Welcome. Reports."
      },
      "/reports": {
        url: "http://app.test/reports",
        title: "Reports",
        headings: ["Reports"],
        links: [],
        buttons: ["Refresh"],
        bodyText: "No export here."
      }
    });

    const first = await page.observe();
    expect(first.title).toBe("Home");

    await page.clickText("Reports");
    const second = await page.observe();
    expect(second.title).toBe("Reports");
    expect(second.buttons).toEqual(["Refresh"]);
  });

  it("records a no-op step when clicked text is absent", async () => {
    const page = new FakeClaimPage({
      "/": { url: "http://app.test/", title: "Home", headings: [], links: [], buttons: [], bodyText: "" }
    });
    await page.clickText("Missing");
    expect((await page.observe()).title).toBe("Home");
  });
});
