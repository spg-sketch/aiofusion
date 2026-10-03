// Development-preview browser checks only. All API requests are intercepted.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const phase = process.argv[2] || "after";
assert.ok(["before", "after"].includes(phase));
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const sizes = [
  ["small-phone", 320, 568],
  ["phone", 375, 667],
  ["large-phone", 430, 932],
  ["landscape-small", 568, 320],
  ["landscape-large", 932, 430],
  ["desktop", 1440, 1000],
];

async function main() {
  fs.mkdirSync("screenshots/demo-dialog", { recursive: true });
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
  const results = [];
  try {
    for (const [name, width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: name !== "desktop" });
      // The Replit development-only banner otherwise overlays the dialog's
      // close button on 320px screens. It is not part of the published product.
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = "#replit-dev-banner { display: none !important; }";
          document.head.append(style);
        });
      });
      let posts = 0;
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => {
        if (route.request().method() === "POST") {
          assert.ok(route.request().url().endsWith("/api/contact/book-demo"), "Unexpected write");
          posts++;
          return route.fulfill({ status: posts === 1 ? 503 : 200, json: posts === 1 ? { error: "Simulated delivery error" } : { ok: true } });
        }
        if (route.request().url().includes("/platform/")) return route.fulfill({ status: 401, json: {} });
        return route.fulfill({ json: [] });
      });
      await page.goto(origin);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 60000 });
      const close = page.getByRole("button", { name: "Close demo enquiry" });
      await page.screenshot({ path: `screenshots/demo-dialog/${phase}-${name}.png` });
      const initial = await dialog.evaluate(el => {
        const box = el.getBoundingClientRect();
        const button = el.querySelector("[data-dialog-close]").getBoundingClientRect();
        const first = el.querySelector("input").getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height,
          close: { x: button.x, y: button.y, width: button.width, height: button.height },
          firstFieldTop: first.top, horizontalOverflow: el.scrollWidth > el.clientWidth,
          inputFont: getComputedStyle(el.querySelector("input")).fontSize };
      });
      const scroller = dialog.locator("[data-dialog-scroll]");
      if (await scroller.count()) await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
      else await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const closeAfterScroll = await close.boundingBox();
      results.push({ name, width, height, initial, closeAfterScroll });
      if (phase === "after") {
        assert.ok(initial.x >= 8 && initial.y >= 8, `${name}: outer margin`);
        assert.ok(initial.x + initial.width <= width - 8 && initial.y + initial.height <= height - 8, `${name}: bounds`);
        assert.equal(initial.horizontalOverflow, false, `${name}: horizontal overflow`);
        assert.ok(initial.close.width >= 44 && initial.close.height >= 44, `${name}: close touch target`);
        assert.ok(closeAfterScroll.y >= 0 && closeAfterScroll.y + closeAfterScroll.height <= height, `${name}: persistent close`);
        if (name !== "desktop") assert.equal(initial.inputFont, "16px");
        const fieldBounds = await dialog.locator("input, textarea, button").evaluateAll(elements =>
          elements.every(el => {
            const box = el.getBoundingClientRect();
            const parent = el.closest('[role="dialog"]').getBoundingClientRect();
            return box.left >= parent.left && box.right <= parent.right;
          }));
        assert.equal(fieldBounds, true, `${name}: controls within horizontal bounds`);
        const promo = dialog.getByText("Diagnose where your brand appears in ChatGPT and Claude.", { exact: true });
        assert.equal(await promo.isVisible(), name === "desktop", `${name}: responsive promotional content`);
        if (name === "desktop") {
          const intro = await dialog.locator(".demo-dialog-intro").boundingBox();
          const form = await dialog.locator(".demo-dialog-form").boundingBox();
          assert.ok(form.x > intro.x && form.y === intro.y, "Desktop two-column presentation");
        }
        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.getByRole("checkbox").evaluate(el => el === document.activeElement), true, "Backward focus trap");
        await page.keyboard.press("Tab");
        assert.equal(await close.evaluate(el => el === document.activeElement), true, "Forward focus trap");
        assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
        const reopen = page.getByRole("button", { name: /book a demo/i }).first();
        await reopen.click();
        await close.click();
        assert.equal(await reopen.evaluate(el => el === document.activeElement), true, "Focus restored");
        await reopen.click();
        await page.getByRole("button", { name: "Request a Demo", exact: true }).click();
        assert.equal(posts, 0, "Required validation must prevent empty submission");
        await page.getByLabel("Your name").fill("Responsive Test");
        await page.getByLabel("Work email").fill("responsive@example.test");
        await page.getByLabel("Company", { exact: false }).fill("Example Test");
        await page.getByLabel("What are you hoping to achieve?").fill("Test dialog usability");
        await page.getByLabel("Work email").fill("not-an-email");
        await page.getByRole("button", { name: "Request a Demo", exact: true }).click();
        assert.equal(posts, 0, "Email validation prevents submission");
        await page.getByLabel("Work email").fill("responsive@example.test");
        await page.getByRole("button", { name: "Request a Demo", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "Simulated delivery error" }).waitFor();
        await page.getByRole("alert").scrollIntoViewIfNeeded();
        await page.getByRole("button", { name: "Request a Demo", exact: true }).click();
        await page.getByText("Request received", { exact: true }).waitFor();
        await page.getByRole("checkbox").check();
        await page.reload();
        await page.getByRole("button", { name: /book a demo/i }).first().waitFor();
        await page.waitForTimeout(500);
        assert.equal(await dialog.count(), 0, "Persistent opt-out");
        await page.getByRole("button", { name: /book a demo/i }).first().click();
        assert.equal(await page.getByRole("checkbox").isChecked(), true);
        await page.getByRole("checkbox").uncheck();
        await page.reload();
        await dialog.waitFor();
        // A reduced visual viewport is not a real software keyboard, but exercises
        // visualViewport resize handling and focused-field scrolling deterministically.
        if (name !== "desktop") {
          await page.evaluate(() => {
            const viewport = new EventTarget();
            Object.assign(viewport, { height: 260, offsetTop: 40, offsetLeft: 0, width: innerWidth });
            Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
            window.dispatchEvent(new Event("resize"));
          });
          for (const label of ["Your name", "Work email", "Company", "What are you hoping to achieve?"]) {
            const field = page.getByLabel(label);
            await field.focus();
            await page.waitForTimeout(100);
            const fieldBox = await field.boundingBox();
            const closeBox = await close.boundingBox();
            assert.ok(fieldBox.y >= closeBox.y + closeBox.height && fieldBox.y + fieldBox.height <= 300, `${name}: reduced viewport ${label}`);
            assert.ok(closeBox.y >= 40 && closeBox.y + closeBox.height <= 300, `${name}: reduced viewport close`);
          }
          await page.screenshot({ path: `screenshots/demo-dialog/after-${name}-reduced-viewport.png` });
        }
        assert.deepEqual(errors, [], `${name}: browser errors`);
      }
      await page.close();
    }
    if (phase === "after") {
      const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
      await page.route("**/api/**", route => route.fulfill({ status: 401, json: {} }));
      await page.goto(`${origin}/contact`);
      const field = page.getByLabel("Your name").first();
      await field.waitFor();
      assert.equal(await field.evaluate(el => getComputedStyle(el).fontSize), "14px", "Contact form remains unchanged");
      assert.equal(await page.getByLabel("What are you hoping to achieve?").getAttribute("rows"), "4");
      assert.equal(await page.locator(".demo-dialog-form").count(), 0, "Contact is outside dialog-scoped CSS");
      await page.screenshot({ path: "screenshots/demo-dialog/after-contact-unchanged.png", fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(`screenshots/demo-dialog/${phase}-results.json`, JSON.stringify({ environment: "Replit development preview", origin, emulation: "Chromium desktop with responsive viewport sizing, not physical devices", developmentBanner: "Hidden by test-only CSS for interaction checks; original before screenshots include it", results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error); process.exit(1); });