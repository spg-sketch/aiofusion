import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

function runIndexAuthGuard(url: string): HTMLElement {
  const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const match = html.match(
    /<script>\s*(\/\/ Public routes are prerendered[\s\S]*?)\s*<\/script>/,
  );
  if (!match) throw new Error("The auth redirect prerender guard is missing from index.html.");
  window.history.replaceState({}, "", url);
  document.body.innerHTML = '<div id="root"><main data-testid="prerendered-marketing">Marketing markup</main></div>';
  window.eval(match[1]);
  return document.getElementById("root")!;
}

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("prerendered auth redirect guard", () => {
  it("replaces prerendered marketing markup before a root OAuth callback boots", () => {
    const root = runIndexAuthGuard("/?oauth_status=ok");

    expect(root).toHaveAttribute("data-auth-redirect", "true");
    expect(root.querySelector('[data-testid="prerendered-marketing"]')).toBeNull();
    expect(root.querySelector('[aria-label="Loading sign in"]')).not.toBeNull();
  });

  it("does not suppress normal prerendered marketing pages", () => {
    const root = runIndexAuthGuard("/?utm_source=newsletter");

    expect(root).not.toHaveAttribute("data-auth-redirect");
    expect(root.querySelector('[data-testid="prerendered-marketing"]')).not.toBeNull();
  });
});