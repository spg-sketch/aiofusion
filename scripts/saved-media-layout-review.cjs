// Render the real component against workspace Vite with synthetic intercepted
// APIs. Never send this layout check to the live deployment or customer data.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
assert.ok(process.env.REPLIT_DEV_DOMAIN, "A workspace development domain is required");
assert.ok(new URL(origin).hostname.endsWith(".replit.dev"), "Only a development preview is permitted");

const publications = [1, 2].map(id => ({
  id, name: `Synthetic publication with a long descriptive name ${id}`,
  category: id === 1 ? "General business" : "National news", accountId: id === 1 ? "layout-fixture" : null,
  website: `https://publication${id}.example.test`, country: "United Kingdom", reachBand: "",
  description: "Synthetic business publication covering entrepreneurship, sustainability and international marketing. All information must remain readable.",
}));
const contacts = publications.map(outlet => ({
  id: outlet.id, outletId: outlet.id, accountId: outlet.accountId, firstName: "Alexandria",
  lastName: "Long-Synthetic-Surname", role: "Deputy Business and International Marketing Editor",
  email: `alexandria.long.synthetic.surname${outlet.id}@publication${outlet.id}.example.test`,
  phone: "", notes: "", outletName: outlet.name, outletCategory: outlet.category,
  outletCountry: outlet.country, outletWebsite: outlet.website, outletDescription: outlet.description,
  linkedinUrl: `https://www.linkedin.com/in/synthetic-layout-${outlet.id}`,
}));
publications.forEach(outlet => { outlet.linkedJournalists = contacts; });

async function main() {
  fs.mkdirSync("screenshots/saved-media", { recursive: true });
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
  const measurements = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("aio.auth.session.v3", JSON.stringify({ username: "layout-fixture", role: "agency", membershipRole: "owner" }));
    });
    await page.route("**/api/**", route => {
      assert.equal(route.request().method(), "GET", "Layout review must not mutate data");
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/media-categories")) return route.fulfill({ json: { standard: ["General business", "National news"], custom: [] } });
      if (url.pathname.endsWith("/media-db/bookmarks")) return route.fulfill({ json: {
        bookmarks: publications.flatMap(outlet => [{ type: "publication", targetId: outlet.id }, { type: "contact", targetId: outlet.id }]), total: 4,
      } });
      if (url.pathname.endsWith("/media-db/search")) {
        assert.equal(url.searchParams.get("scope"), "saved");
        const publicationSearch = url.searchParams.get("type") === "publications";
        return route.fulfill({ json: {
          results: (publicationSearch ? publications : contacts).map(record => ({
            type: publicationSearch ? "outlet" : "contact", id: record.id,
            [publicationSearch ? "outlet" : "contact"]: record,
            matchedFields: [], matchedPhrases: [], reasons: [], authority: 0,
          })), total: 2, counts: { contacts: publicationSearch ? 0 : 2, outlets: publicationSearch ? 2 : 0 },
        } });
      }
      return route.fulfill({ json: {} });
    });
    await page.route("**/__saved_media_layout_review", route => route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0;background:#196579}#shell{display:flex;width:100%;font-family:Inter,sans-serif}aside{width:280px;flex-shrink:0}main{flex:1;min-width:0}@media(max-width:767px){aside{display:none}}</style>
      </head><body><div id="shell"><aside aria-label="Simulated sidebar footprint"></aside><main id="root"></main></div>
      <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
      window.__vite_plugin_react_preamble_installed__=true;
      const React=(await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      await import('/src/index.css');
      const {MediaDatabasePage}=await import('/src/pages/MediaDatabasePage.tsx');
      createRoot(document.getElementById('root')).render(React.createElement(MediaDatabasePage));
      </script></body></html>`,
    }));
    await page.goto(`${origin}/__saved_media_layout_review`);
    await page.getByRole("button", { name: "My Media Database", exact: true }).click();
    await page.locator(".media-saved-table tbody tr").first().waitFor();
    for (const type of ["contacts", "publications"]) {
      await page.getByLabel("Search record type").selectOption(type);
      await page.locator(`.media-saved-table--${type} tbody tr`).first().waitFor();
      for (const width of [1280, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const rows = await page.locator(".media-saved-table-scroll").evaluateAll(regions => regions.map(region => {
          const table = region.querySelector("table");
          return {
            width: region.clientWidth, contentWidth: region.scrollWidth,
            columns: table.querySelectorAll("thead th").length,
            fontSize: getComputedStyle(table).fontSize,
            cellsWrap: [...table.querySelectorAll("th,td")].every(cell => getComputedStyle(cell).whiteSpace === "normal"),
            actionsInside: [...table.querySelectorAll("td:last-child button")].every(button => button.getBoundingClientRect().right <= region.getBoundingClientRect().right + 1),
          };
        }));
        assert.equal(rows.length, 2, "Both sector groups should render");
        assert.ok(rows.every(row => row.fontSize === "12px" && row.cellsWrap), "Readable wrapping must apply to all cells");
        assert.ok(rows.every(row => row.columns === (type === "contacts" ? 10 : 6)), "No information columns may disappear");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "The whole page must not overflow");
        if (width >= 1024) assert.ok(rows.every(row => row.contentWidth <= row.width + 1 && row.actionsInside), `Desktop actions clipped at ${width}`);
        else {
          assert.ok(rows.every(row => row.contentWidth > row.width), "Phone scrolling must be contained");
          assert.equal(await page.getByText("Scroll sideways to see all columns and actions.", { exact: true }).count(), 2);
          const region = page.getByRole("region", { name: `Saved ${type} in General business` });
          await region.focus();
          await page.keyboard.press("End");
          await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
          await page.waitForTimeout(100);
          const remove = region.getByRole("button", { name: "Remove from My Media Database" });
          assert.ok(await remove.evaluate(button => {
            const container = button.closest(".media-saved-table-scroll").getBoundingClientRect();
            const rect = button.getBoundingClientRect();
            return rect.left >= container.left && rect.right <= container.right + 1;
          }), "Removal must remain reachable on a phone");
        }
        await page.screenshot({ path: `screenshots/saved-media/${type}-${width}.png` });
        measurements.push({ type, viewport: width, rows });
      }
    }
    assert.deepEqual(errors, [], "The component must not raise browser errors");
    console.log(JSON.stringify({ passed: true, fixture: "synthetic only", measurements }, null, 2));
    await page.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });