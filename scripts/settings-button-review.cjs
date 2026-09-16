// Isolated visual review of real components. All API calls are intercepted.
// Run against the running workspace Vite origin, never a deployed site.
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const phase = process.argv[2] || "after";
const roles = ["client", "agency", "admin"];
const company = {
  companyName: "Review Studio", billingEmail: "billing@example.invalid",
  keyAccountHolderEmail: "owner@example.invalid", addressLine1: "1 Example Road",
  addressLine2: "", townCity: "London", postcode: "SW1A 1AA", country: "GB", vatNumber: "",
};
const subscription = {
  status: "active", plan: "agency", frequency: "annual", currentPeriodEnd: "2027-09-16",
  entitled: true, applicablePlan: "agency", includedProjects: 2, projectAllowance: 2,
  projectsUsed: 1, portalAvailable: true, checkoutAvailable: true, companyRecordComplete: true,
  trial: { status: "used", daysRemaining: 0 }, projects: [], unassignedAddons: [],
  tierPrices: {}, prices: { annual: { yearlyTotal: 10000 }, quarterly: { perQuarter: 3000, yearlyTotal: 12000 } },
};
async function main() {
  fs.mkdirSync("screenshots", { recursive: true });
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
  const results = [];
  for (const role of roles) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
    page.on("requestfailed", request => console.error("Request failed:", request.url(), request.failure()?.errorText));
    const session = { username: `review-${role}`, role, membershipRole: "owner", companyName: "Review Studio", userName: "Review User" };
    const users = [{ username: "review-child", password: "", parent: session.username, role: "client", createdAt: 1, displayName: "Example Client", website: "https://example.invalid", managed: true }];
    let writes = 0;
    await page.route("**/api/**", async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() !== "GET") {
        writes++;
        await new Promise(resolve => setTimeout(resolve, 400));
        return route.fulfill({ json: { ok: true, record: req.postDataJSON() } });
      }
      if (path.endsWith("/me")) return route.fulfill({ json: { account: { ...session, googleLinked: false, microsoftLinked: false, website: "https://example.invalid" }, masterOwner: role === "admin", hasPassword: true, accountProfile: { website: "https://example.invalid" } } });
      if (path.endsWith("/accounts")) return route.fulfill({ json: { accounts: users } });
      if (path.endsWith("/billing/subscription")) return route.fulfill({ json: subscription });
      if (path.endsWith("/billing-details")) return route.fulfill({ json: company });
      if (path.endsWith("/sessions")) return route.fulfill({ json: { sessions: [] } });
      if (path.includes("/mfa")) return route.fulfill({ json: { enabled: false } });
      return route.fulfill({ status: 404, json: { error: "Not present in isolated review fixture" } });
    });
    await page.route("**/__settings_button_review", route => route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
      <div id="review-label" style="padding:8px;background:#fff3cd;font:14px sans-serif">Workspace component fixture: ${role} / ${phase}. API calls mocked; no account changes.</div><div id="root"></div>
      <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      localStorage.setItem('aio.auth.users.v3', ${JSON.stringify(JSON.stringify(users))});
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      await import('/src/index.css');
      const {SubAccountsPage} = await import('/src/pages/SubAccountsPage.tsx');
      window.backCount = 0;
      createRoot(document.getElementById('root')).render(React.createElement(SubAccountsPage,{
        session:${JSON.stringify(session)}, onBack:()=>window.backCount++,
        onSignOut:()=>{}, onOpenGeorge:()=>{}, onOpenProject:()=>{},
        onAssignProjectOwner:async()=>({ok:true})
      }));
      </script></body></html>`,
    }));
    await page.goto(`${origin}/__settings_button_review`);
    await page.getByRole("heading", { name: "Account Settings", exact: true }).waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `screenshots/settings-${role}-workspace-${phase}.png`, fullPage: true });
    const back = page.getByRole("button", { name: "Back to platform", exact: true });
    await back.focus();
    const focus = await back.evaluate(b => getComputedStyle(b).outlineWidth);
    assert.equal(focus, "3px");
    await back.press("Enter");
    assert.equal(await page.evaluate(() => window.backCount), 1);
    if (role === "client") {
      await page.getByRole("button", { name: "Edit details", exact: true }).click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Save details", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Edit details", exact: true }).click();
      await page.getByRole("button", { name: "Save details", exact: true }).click();
      await page.getByRole("button", { name: "Edit details", exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "Billing details", exact: true }).first().click();
    const save = page.getByRole("button", { name: "Save company information", exact: true });
    await save.waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/billing-${role}-workspace-${phase}.png`, fullPage: true });
    const metrics = await save.evaluate(b => {
      const s = getComputedStyle(b);
      return { height: s.height, radius: s.borderRadius, font: s.fontSize, weight: s.fontWeight, transform: s.textTransform };
    });
    if (phase === "after") assert.equal(metrics.radius, "12px");
    await save.click();
    await page.getByRole("button", { name: "Saving...", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Saving...", exact: true }).isDisabled(), true);
    await page.getByRole("status").filter({ hasText: "Company and billing information saved." }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `screenshots/billing-${role}-workspace-mobile-${phase}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    await page.getByRole("button", { name: "Profile & workspace", exact: true }).last().click();
    await page.screenshot({ path: `screenshots/settings-${role}-workspace-mobile-${phase}.png`, fullPage: true });
    if (role !== "client") {
      await page.getByRole("button", { name: role === "agency" ? "Client Projects" : "Client accounts", exact: true }).last().click();
      await page.getByRole("button", { name: "Edit details", exact: true }).waitFor();
      await page.screenshot({ path: `screenshots/clients-${role}-workspace-mobile-${phase}.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: `screenshots/clients-${role}-workspace-${phase}.png`, fullPage: true });
      await page.getByRole("button", { name: "Edit details", exact: true }).click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.getByPlaceholder("Client name").count(), 0);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Sign-in & security", exact: true }).first().click();
    await page.getByRole("button", { name: "Change Password", exact: true }).click();
    await page.getByRole("button", { name: "Hide Change Password", exact: true }).click();
    await page.screenshot({ path: `screenshots/security-${role}-workspace-${phase}.png`, fullPage: true });
    results.push({ role, metrics, keyboardFocus: focus, mobileOverflow: overflow, interceptedWrites: writes, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(`screenshots/settings-review-${phase}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error); process.exit(1); });