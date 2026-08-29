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
    expect(getEmailLogoUrl()).toBe("https://aiofusion.ai/images/logo-color.png");
    const html = buildEmailHtml({ label: "Test", bodyHtml: "<p>Test</p>" });
    expect(html).toContain('href="https://staging.aiofusion.ai"');
    expect(html).toContain('src="https://aiofusion.ai/images/logo-color.png"');
  });

  it("uses the production custom domain for links while keeping a safe logo fallback", async () => {
    process.env.DEPLOYMENT_ENV = "production";
    process.env.CANONICAL_DOMAIN = "aiofusion.ai";
    delete process.env.REPLIT_DOMAINS;
    delete process.env.EMAIL_LOGO_URL;

    const { getAppBaseUrl } = await import("./app-url");
    const { buildEmailHtml, getEmailLogoUrl } = await import("./email-template");

    expect(getAppBaseUrl()).toBe("https://aiofusion.ai");
    expect(getEmailLogoUrl()).toBe("https://aiofusion.ai/images/logo-color.png");
    const html = buildEmailHtml({ label: "Test", bodyHtml: "<p>Test</p>" });
    expect(html).toContain('href="https://aiofusion.ai"');
    expect(html).toContain('src="https://aiofusion.ai/images/logo-color.png"');
  });

  it("allows a CDN URL to replace the stable object-storage route", async () => {
    process.env.EMAIL_LOGO_URL = "https://cdn.example.com/aio-fusion-logo.png";
    const { getEmailLogoUrl } = await import("./email-template");
    expect(getEmailLogoUrl()).toBe("https://cdn.example.com/aio-fusion-logo.png");
  });

  it("normalizes canonical domains to a host without a path", async () => {
    process.env.DEPLOYMENT_ENV = "production";
    process.env.CANONICAL_DOMAIN = "https://www.aiofusion.ai/a/path?ignored=yes";

    const { getAppBaseUrl, normalizeCanonicalDomain } = await import("./app-url");

    expect(normalizeCanonicalDomain(process.env.CANONICAL_DOMAIN)).toBe("aiofusion.ai");
    expect(getAppBaseUrl()).toBe("https://aiofusion.ai");
  });

  it("keeps staging links on its isolated host when production canonical is copied", async () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.CANONICAL_DOMAIN = "aiofusion.ai";
    process.env.REPLIT_DOMAINS = "preview.example.replit.app";

    const { getAppBaseUrl } = await import("./app-url");

    expect(getAppBaseUrl()).toBe("https://staging.aiofusion.ai");
  });

  it("rejects cross-environment canonical domains at startup validation", async () => {
    const { assertCanonicalDomainIsSafeForDeployment } = await import("./app-url");

    process.env.DEPLOYMENT_ENV = "production";
    process.env.CANONICAL_DOMAIN = "staging.aiofusion.ai";
    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(
      /production deployment requires CANONICAL_DOMAIN/,
    );

    process.env.DEPLOYMENT_ENV = "staging";
    process.env.CANONICAL_DOMAIN = "aiofusion.ai";
    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(
      /staging deployment requires CANONICAL_DOMAIN/,
    );
  });

  it("requires an explicit deployment environment when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DEPLOYMENT_ENV;
    process.env.CANONICAL_DOMAIN = "aiofusion.ai";
    const { assertCanonicalDomainIsSafeForDeployment } = await import("./app-url");

    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(
      /deployed NODE_ENV requires DEPLOYMENT_ENV/,
    );

    process.env.NODE_ENV = "staging";
    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(
      /deployed NODE_ENV requires DEPLOYMENT_ENV/,
    );
  });

  it("rejects invalid canonical values in deployed environments", async () => {
    const { assertCanonicalDomainIsSafeForDeployment } = await import("./app-url");

    process.env.DEPLOYMENT_ENV = "production";
    process.env.CANONICAL_DOMAIN = "https://";
    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(/invalid CANONICAL_DOMAIN/);

    process.env.DEPLOYMENT_ENV = "staging";
    process.env.CANONICAL_DOMAIN = "not a valid host";
    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(/invalid CANONICAL_DOMAIN/);
  });

  it("rejects unrelated canonical hosts in both deployed environments", async () => {
    const { assertCanonicalDomainIsSafeForDeployment } = await import("./app-url");

    process.env.DEPLOYMENT_ENV = "production";
    process.env.CANONICAL_DOMAIN = "other.example.com";
    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(
      /production deployment requires CANONICAL_DOMAIN/,
    );

    process.env.DEPLOYMENT_ENV = "staging";
    process.env.CANONICAL_DOMAIN = "staging.other.example.com";
    expect(assertCanonicalDomainIsSafeForDeployment).toThrow(
      /staging deployment requires CANONICAL_DOMAIN/,
    );
  });

  it("normalizes the first Replit preview domain before using it", async () => {
    process.env.DEPLOYMENT_ENV = "development";
    delete process.env.CANONICAL_DOMAIN;
    process.env.REPLIT_DOMAINS = "https://preview.example.com/untrusted/path,other.example.com";
    const { getAppBaseUrl } = await import("./app-url");

    expect(getAppBaseUrl()).toBe("https://preview.example.com");
  });

  it("pins deployed frontend origins independently of request hosts", async () => {
    const { getDeployedAppOrigin } = await import("./app-url");

    process.env.DEPLOYMENT_ENV = "production";
    expect(getDeployedAppOrigin()).toBe("https://aiofusion.ai");

    process.env.DEPLOYMENT_ENV = "staging";
    expect(getDeployedAppOrigin()).toBe("https://staging.aiofusion.ai");

    process.env.DEPLOYMENT_ENV = "development";
    expect(getDeployedAppOrigin()).toBeUndefined();
  });
});