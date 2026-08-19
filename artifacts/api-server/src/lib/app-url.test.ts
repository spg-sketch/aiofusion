import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = {
  CANONICAL_DOMAIN: process.env.CANONICAL_DOMAIN,
  DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
  NODE_ENV: process.env.NODE_ENV,
  REPLIT_DOMAINS: process.env.REPLIT_DOMAINS,
  EMAIL_LOGO_URL: process.env.EMAIL_LOGO_URL,
};

function restore(name: keyof typeof originalEnvironment): void {
  const value = originalEnvironment[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const name of Object.keys(originalEnvironment) as Array<keyof typeof originalEnvironment>) {
    restore(name);
  }
  vi.restoreAllMocks();
});

describe("environment-specific email URLs", () => {
  it("uses the staging custom domain for links while keeping a safe logo fallback", async () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.CANONICAL_DOMAIN = "staging.aiofusion.ai";
    delete process.env.REPLIT_DOMAINS;
    delete process.env.EMAIL_LOGO_URL;

    const { getAppBaseUrl } = await import("./app-url");
    const { buildEmailHtml, getEmailLogoUrl } = await import("./email-template");

    expect(getAppBaseUrl()).toBe("https://staging.aiofusion.ai");
    expect(getEmailLogoUrl()).toBe("https://www.aiofusion.ai/images/logo-color.png");
    const html = buildEmailHtml({ label: "Test", bodyHtml: "<p>Test</p>" });
    expect(html).toContain('href="https://staging.aiofusion.ai"');
    expect(html).toContain('src="https://www.aiofusion.ai/images/logo-color.png"');
  });

  it("uses the production custom domain for links while keeping a safe logo fallback", async () => {
    process.env.DEPLOYMENT_ENV = "production";
    process.env.CANONICAL_DOMAIN = "www.aiofusion.ai";
    delete process.env.REPLIT_DOMAINS;
    delete process.env.EMAIL_LOGO_URL;

    const { getAppBaseUrl } = await import("./app-url");
    const { buildEmailHtml, getEmailLogoUrl } = await import("./email-template");

    expect(getAppBaseUrl()).toBe("https://www.aiofusion.ai");
    expect(getEmailLogoUrl()).toBe("https://www.aiofusion.ai/images/logo-color.png");
    const html = buildEmailHtml({ label: "Test", bodyHtml: "<p>Test</p>" });
    expect(html).toContain('href="https://www.aiofusion.ai"');
    expect(html).toContain('src="https://www.aiofusion.ai/images/logo-color.png"');
  });

  it("allows a CDN URL to replace the stable object-storage route", async () => {
    process.env.EMAIL_LOGO_URL = "https://cdn.example.com/aio-fusion-logo.png";
    const { getEmailLogoUrl } = await import("./email-template");
    expect(getEmailLogoUrl()).toBe("https://cdn.example.com/aio-fusion-logo.png");
  });
});