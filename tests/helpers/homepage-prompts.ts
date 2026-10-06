import { expect, type Page } from "@playwright/test";

/** Use the real choices rather than seeding consent or mocking a landing page. */
export async function dismissHomepagePrompts(page: Page) {
  const arrival = await page.evaluate(() => {
    try {
      const preference = JSON.parse(localStorage.getItem("aio.cookiePreferences.v1") ?? "null");
      return {
        hasPreference: preference?.version === 1 && typeof preference.analytics === "boolean"
          && typeof preference.savedAt === "number" && preference.savedAt <= Date.now()
          && Date.now() - preference.savedAt < 180 * 86400000,
        demoOptOut: localStorage.getItem("aio-demo-opt-out") === "1",
      };
    } catch { return { hasPreference: false, demoOptOut: false }; }
  });
  const choices = page.getByRole("region", { name: "Cookie choices" });
  const demo = page.getByRole("dialog", { name: /see your ai visibility/i });
  if (!arrival.hasPreference) {
    await expect(choices).toBeVisible({ timeout: 25_000 });
    await expect(demo).toBeHidden();
    await choices.getByRole("button", { name: "Essential only" }).click();
    await expect(choices).toBeHidden();
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem("aio.cookiePreferences.v1") ?? "null")?.analytics,
    )).toBe(false);
    await expect(page.locator("#aio-analytics-loader")).toHaveCount(0);
  }
  // New visitors now receive the introduction as soon as their choice closes
  // the notice; returning visitors receive it on arrival.
  if (!arrival.demoOptOut) {
    await expect(demo).toBeVisible({ timeout: 25_000 });
    await page.keyboard.press("Escape");
  }
  await expect(demo).toBeHidden();
}
