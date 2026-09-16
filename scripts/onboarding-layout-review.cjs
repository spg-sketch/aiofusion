// Visual layout regression against workspace Vite only. APIs are intercepted;
// no accounts, authentication state, or payment records are changed.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const phase = process.argv[2] || "after";
assert.ok(["before", "after"].includes(phase));
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;

async function main() {
  fs.mkdirSync("screenshots/onboarding", { recursive: true });
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
  const results = [];
  try {
    for (const step of ["account_type", "workspace_basics", "access", "billing"]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => {
        assert.equal(route.request().method(), "GET", "Layout review must not submit data");
        const path = new URL(route.request().url()).pathname;
        let json = {};
        if (path.endsWith("/onboarding")) json = { state: { step, ...(step === "billing" ? { accessChoice: "paid" } : {}) } };
        else if (path.endsWith("/me")) json = { accountProfile: {} };
        else if (path.endsWith("/billing/subscription")) json = {
          status: "none", applicablePlan: "inhouse", entitled: false,
          trial: { status: "eligible", daysRemaining: 0 }, includedProjects: 1,
          checkoutAvailable: true, companyRecordComplete: false,
          projects: [], unassignedAddons: [], tierPrices: {},
          prices: { annual: { yearlyTotal: 100 }, quarterly: { perQuarter: 30, yearlyTotal: 120 } },
        };
        return route.fulfill({ json });
      });
      await page.route("**/__onboarding_layout_review", route => route.fulfill({
        contentType: "text/html",
        body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
        <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const React = (await import('/node_modules/.vite/deps/react.js')).default;
        const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
        await import('/src/index.css');
        const {GuidedOnboardingPage} = await import('/src/pages/GuidedOnboardingPage.tsx');
        createRoot(document.getElementById('root')).render(React.createElement(GuidedOnboardingPage,{
          onSignOut:()=>{}, onRoleChanged:()=>{}, onComplete:async()=>({ok:true})
        }));
        </script></body></html>`,
      }));
      await page.goto(`${origin}/__onboarding_layout_review`);
      await page.locator(".fo-shell").waitFor();
      if (step === "billing") await page.getByText("Company and billing information", { exact: true }).waitFor();
      for (const width of [1280, 1600, 2560, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(650);
        const metrics = await page.evaluate(() => {
          const rail = document.querySelector(".fo-rail");
          const shell = document.querySelector(".fo-shell");
          const inner = document.querySelector(".fo-content-inner");
          return {
            railLeft: rail.getBoundingClientRect().left,
            railWidth: rail.getBoundingClientRect().width,
            railColor: getComputedStyle(rail).backgroundColor,
            shellWidth: shell.getBoundingClientRect().width,
            formWidth: inner.getBoundingClientRect().width,
            layout: getComputedStyle(shell).display,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        assert.equal(metrics.railLeft, phase === "before" ? Math.max(0, (width - 1440) / 2) : 0);
        assert.equal(metrics.railWidth, width <= 760 ? width : 310);
        assert.equal(metrics.railColor, "rgb(16, 43, 54)");
        assert.ok(metrics.formWidth <= 920);
        assert.equal(metrics.layout, width <= 760 ? "block" : "flex");
        assert.equal(metrics.overflow, false);
        assert.equal(metrics.shellWidth, phase === "before" ? Math.min(width, 1440) : width);
        results.push({ step, width, ...metrics });
        if (width === 1600 || width === 390) {
          await page.screenshot({ path: `screenshots/onboarding/${phase}-${step}-${width}.png`, fullPage: true });
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(`screenshots/onboarding/${phase}-metrics.json`, JSON.stringify({
    environment: "Development workspace preview; real onboarding components with intercepted API fixtures. Not production.",
    results,
  }, null, 2));
  console.log(`${phase}: ${results.length} step/viewport checks passed`);
}
main().catch(error => { console.error(error); process.exit(1); });