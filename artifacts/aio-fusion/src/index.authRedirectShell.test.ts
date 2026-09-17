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

  it("shows neutral payment confirmation before the checkout-return app boots", () => {
    const root = runIndexAuthGuard("/?checkout=success&session_id=cs_test_confirmation");

    expect(root.querySelector('[data-testid="prerendered-marketing"]')).toBeNull();
    expect(root.querySelector('[aria-label="Checking your payment"]')).not.toBeNull();
    expect(root).toHaveTextContent("Please wait while we confirm your payment.");
    expect(root).not.toHaveTextContent("Preparing secure sign in");
    expect(root).not.toHaveTextContent("Payment confirmed");
  });

  it("suppresses marketing markup on the explicit protected reload destination", () => {
    const root = runIndexAuthGuard("/platform");

    expect(root).toHaveAttribute("data-auth-redirect", "true");
    expect(root.querySelector('[data-testid="prerendered-marketing"]')).toBeNull();
    expect(root.querySelector('[aria-label="Loading sign in"]')).not.toBeNull();
  });

  it("also protects the project hub reload destination", () => {
    const root = runIndexAuthGuard("/project-hub");

    expect(root).toHaveAttribute("data-auth-redirect", "true");
    expect(root.querySelector('[data-testid="prerendered-marketing"]')).toBeNull();
    expect(root.querySelector('[aria-label="Loading sign in"]')).not.toBeNull();
  });
});