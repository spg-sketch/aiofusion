// Read-only checks against a running app. Never submits an enquiry or mocks APIs.
// WebKit can be selected with DEMO_BROWSER=webkit on a supported browser runtime.
const { chromium, webkit, devices } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

async function main() {
  const origin = process.env.DEMO_TEST_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const engine = process.env.DEMO_BROWSER || "chromium";
  assert.ok(["chromium", "webkit"].includes(engine));
  const browser = await (engine === "webkit" ? webkit : chromium).launch({
    timeout: 20000,
    ...(process.env.DEMO_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMO_BROWSER_EXECUTABLE } : {}),
  });
  const results = [];
  const output = process.env.DEMO_TEST_OUTPUT || "/tmp/aio-demo-consent";
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const [name, profile] of [
      ["iphone", devices["iPhone 13"]],
      ["android", devices["Pixel 7"]],
      ["desktop", { viewport: { width: 1440, height: 1000 } }],
    ]) {
      for (const choice of ["Essential only", "Allow analytics", "Continue with essential cookies only"]) {
        const context = await browser.newContext(profile);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        // Prevent accidental writes even if this test is changed later.
        await page.route("**/api/**", route => {
          assert.ok(["GET", "HEAD", "OPTIONS"].includes(route.request().method()), "No live writes allowed");
          return route.continue();
        });
        // Development tooling is not part of the published website.
        await page.addInitScript(() => {
          document.addEventListener("DOMContentLoaded", () => {
            const style = document.createElement("style");
            style.textContent = "#replit-dev-banner { display: none !important; }";
            document.head.append(style);
          });
        });
        await page.goto(origin);
        const cookie = page.getByRole("region", { name: "Cookie choices" });
        const dialog = page.getByRole("dialog");
        await page.getByRole("button", { name: /book a demo/i }).first().waitFor({ timeout: 60000 });
        await cookie.waitFor();
        assert.equal(await dialog.count(), 0, "Cookie choice comes first");
        await page.getByRole("button", { name: choice, exact: true }).click();
        await dialog.waitFor();
        assert.equal(await cookie.count(), 0, "No overlapping prompts");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "No horizontal overflow");
        if (choice !== "Allow analytics") assert.equal(await page.locator("#aio-analytics-loader").count(), 0);
        const close = page.getByRole("button", { name: "Close demo enquiry" });
        const bounds = await close.boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= profile.viewport.height, "Close visible");
        await page.screenshot({ path: `${output}/${engine}-${name}-${choice.split(" ")[0]}.png` });
        if (profile.hasTouch) await close.tap(); else await close.click();
        await dialog.waitFor({ state: "detached" });
        // A later preference save must not reopen a dismissed introduction.
        await page.getByRole("button", { name: "Cookie preferences", exact: true }).click();
        await page.getByRole("button", { name: "Save preferences", exact: true }).click();
        await cookie.waitFor({ state: "detached" });
        assert.equal(await dialog.count(), 0);
        await page.reload();
        await dialog.waitFor({ timeout: 60000 });
        await page.getByRole("checkbox", { name: /don't show this again/i }).check();
        await page.reload();
        await page.getByRole("button", { name: /book a demo/i }).first().waitFor({ timeout: 60000 });
        assert.equal(await dialog.count(), 0, "Returning opt-out honoured");
        await page.getByRole("button", { name: /book a demo/i }).first().click();
        await dialog.waitFor();
        assert.equal(await page.getByRole("checkbox", { name: /don't show this again/i }).isChecked(), true);
        assert.deepEqual(errors, []);
        results.push({ engine, name, choice, passed: true });
        await context.close();
      }
    }
    // Saving preferences away from the homepage must not introduce a demo.
    const page = await browser.newPage();
    await page.goto(`${origin}/contact`);
    await page.getByRole("button", { name: "Essential only", exact: true }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.close();
  } finally {
    await browser.close();
    fs.writeFileSync(`${output}/${engine}-results.json`, JSON.stringify({
      origin, engine, developmentBanner: "Hidden by test-only CSS",
      limitations: "Browser emulation, not physical iPhones or a native iOS keyboard",
      results,
    }, null, 2));
  }
  console.log(JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
