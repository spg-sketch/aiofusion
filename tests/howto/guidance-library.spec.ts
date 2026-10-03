import { expect, test } from "@playwright/test";

test("synthetic library: Project Hub navigation, saved images, fallbacks and reader return on desktop and mobile", async ({ page }) => {
  test.setTimeout(120_000);
  // Only loopback's disposable release harness is used. Content responses below
  // are synthetic UI fixtures, not evidence of production data or storage.
  await page.goto("/platform");
  await page.getByPlaceholder("Email or username").fill("release@example.invalid");
  await page.getByPlaceholder("Password", { exact: true }).fill("release-harness-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Project Hub", exact: true })).toBeVisible();

  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000; canvas.height = 625;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#1A647B"; context.fillRect(0, 0, 1000, 625);
    context.fillStyle = "#fff"; context.font = "48px sans-serif";
    context.fillText("Synthetic saved guide image", 90, 300);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const imageUrl = "http://127.0.0.1:5000/__guidance-fixture/saved.png";
  await page.route("**/__guidance-fixture/saved.png", (route) => route.fulfill({
    status: 200, contentType: "image/png", body: Buffer.from(png, "base64"),
  }));
  await page.route("**/__guidance-fixture/missing.png", (route) => route.fulfill({ status: 404, body: "" }));
  const common = { readTime: "4 min read", displayOrder: 0, status: "published", createdAt: "", updatedAt: "", publishedAt: "" };
  const entries = [
    { ...common, id: "saved-image", title: "Getting started with your project", description: "Saved content and its original image, presented as a readable library entry.", type: "Guide", body: [
      { type: "paragraph", runs: [{ text: "Complete guide body retained." }] },
      { type: "image", mediaId: "not-resolved", altText: "Unresolved image" },
      { type: "image", mediaId: "saved", altText: "Saved project screen", caption: "Original saved caption", url: imageUrl },
      { type: "heading", runs: [{ text: "Next steps" }] },
      { type: "image", mediaId: "second", altText: "Second saved screen", caption: "Second caption", url: imageUrl },
    ] },
    { ...common, id: "no-image", title: "Planning your content", description: "An article without an image uses the branded fallback.", type: "Article", body: [] },
    { ...common, id: "failed-image", title: "Watch the platform walkthrough", description: "A failed image never blocks the video entry.", type: "Video", body: [
      { type: "image", mediaId: "missing", altText: "Unavailable screen", url: "http://127.0.0.1:5000/__guidance-fixture/missing.png" },
      { type: "video", url: "https://example.com/video", caption: "Watch the walkthrough" },
    ] },
  ];
  let collection = entries;
  await page.route(/\/api\/howto(?:\/[^/?]+)?(?:\?.*)?$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    return route.fulfill({ json: id ? entries.find((entry) => entry.id === id) : collection });
  });

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const size = viewport.width > 1000 ? "desktop" : "mobile";
    await page.setViewportSize(viewport);
    await page.goto("/platform");
    await page.getByRole("button", { name: "Project Hub", exact: true }).click();
    await expect(page).toHaveURL(/\/project-hub$/);
    await page.getByRole("button", { name: /How-to library Guidance/ }).click();
    await expect(page).toHaveURL(/\/guidance$/);
    await expect(page.getByRole("heading", { name: "Guidance", exact: true })).toBeVisible();
    const preview = page.getByTestId("preview-howto-saved-image");
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1000)).toBe(true);
    await expect(preview).toHaveClass(/opacity-100/);
    await page.getByTestId("card-howto-failed-image").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("preview-howto-failed-image")).toHaveCount(0);
    await expect(page.getByTestId("card-howto-failed-image")).toContainText("Watch video");
    await expect(page.getByTestId("card-howto-no-image").locator("img")).toHaveCount(0);
    await expect(page.getByTestId("card-howto-no-image")).toContainText("Read article");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/guidance-collection-${size}.png`, fullPage: true });

    await page.getByTestId("filter-Guide").click();
    await expect(page.getByTestId("card-howto-no-image")).toHaveCount(0);
    await expect(page.getByTestId("card-howto-saved-image")).toContainText("Read guide");
    if (size === "desktop") {
      const cardWidth = (await page.getByTestId("card-howto-saved-image").boundingBox())!.width;
      expect(cardWidth).toBeGreaterThan(900);
    }
    await page.screenshot({ path: `test-results/guidance-single-${size}.png`, fullPage: true });
    await page.getByTestId("card-howto-saved-image").click();
    await expect(page.getByTestId("detail-title")).toHaveText(entries[0].title);
    await expect(page.locator("article")).toContainText("Complete guide body retained.");
    await expect(page.locator("figcaption")).toHaveText(["Original saved caption", "Second caption"]);
    await expect(page.getByRole("img", { name: "Saved project screen", exact: true })).toBeVisible();
    await expect.poll(() => page.getByRole("img", { name: "Saved project screen", exact: true }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1000);
    await expect(page.getByRole("img", { name: "Second saved screen", exact: true })).toHaveAttribute("src", imageUrl);
    await page.getByTestId("button-back-guidance").click();
    await expect(page.getByTestId("filter-Guide")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("filter-All").click();
    await page.goBack();
    await expect(page).toHaveURL(/\/project-hub$/);
    await page.getByRole("button", { name: "Platform home", exact: true }).click();
    await page.getByRole("button", { name: /Getting started with AIO Fusion/ }).click();
    await expect(page).toHaveURL(/\/guidance$/);
    await page.reload();
    await expect(page.getByTestId("card-howto-saved-image")).toBeVisible();
    await page.getByTestId("button-back").click();
    await expect(page).toHaveURL(/\/platform$/);
  }
  // A genuinely one-entry library, not just a type-filtered collection.
  collection = [entries[0]];
  await page.goto("/guidance");
  await expect(page.getByTestId("guidance-collection")).not.toHaveClass(/sm:grid-cols-2/);
  await expect(page.getByTestId("preview-howto-saved-image")).toBeVisible();
});