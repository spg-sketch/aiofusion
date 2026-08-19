import { afterEach, describe, expect, it, vi } from "vitest";

const { loggerError, loggerInfo } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("./logger", () => ({
  logger: {
    error: loggerError,
    info: loggerInfo,
  },
}));

vi.mock("./notify-email", () => ({
  getAppBaseUrl: () => "https://www.aiofusion.ai",
}));

import { checkMicrosoftOAuthCredentials } from "./microsoft-oauth-health";

afterEach(() => {
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  vi.clearAllMocks();
});

describe("checkMicrosoftOAuthCredentials", () => {
  it("treats Microsoft's invalid-code response as a valid credential check", async () => {
    process.env.MICROSOFT_CLIENT_ID = "client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "client-secret";
    let request: RequestInit | undefined;

    const result = await checkMicrosoftOAuthCredentials(async (_url, init) => {
      request = init;
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    });

    expect(result).toEqual({ configured: true, healthy: true });
    expect(request?.method).toBe("POST");
    expect(request?.body).toContain("client_id=client-id");
    expect(request?.body).toContain("grant_type=authorization_code");
    expect(loggerInfo).toHaveBeenCalledOnce();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("logs a loud failure when Microsoft rejects the client credentials", async () => {
    process.env.MICROSOFT_CLIENT_ID = "client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "expired-secret";

    const result = await checkMicrosoftOAuthCredentials(async () =>
      new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(result.healthy).toBe(false);
    expect(result.reason).toContain("client ID or client secret");
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft", errorCode: "invalid_client" }),
      expect.stringContaining("FAILED"),
    );
  });

  it("reports missing configuration without making a network request", async () => {
    let called = false;

    const result = await checkMicrosoftOAuthCredentials(async () => {
      called = true;
      return new Response(null, { status: 500 });
    });

    expect(result).toEqual({
      configured: false,
      healthy: false,
      reason: "missing MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET",
    });
    expect(called).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft",
        missing: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
      }),
      expect.stringContaining("Microsoft sign-in is not configured"),
    );
  });
});