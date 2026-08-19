import { logger } from "./logger";
import { getAppBaseUrl } from "./notify-email";

const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_CALLBACK_PATH = "/api/platform/auth/microsoft/callback";
const HEALTH_CHECK_TIMEOUT_MS = 10_000;

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type MicrosoftOAuthHealth = {
  configured: boolean;
  healthy: boolean;
  reason?: string;
};

/**
 * Verify the Microsoft client credentials without requiring an app-only Graph
 * permission. A deliberately invalid authorization code makes Microsoft
 * validate the client id and secret first, then return invalid_grant when those
 * credentials are accepted. This is safer than a client_credentials probe,
 * which would require a separate application permission that this sign-in flow
 * does not use.
 */
export async function checkMicrosoftOAuthCredentials(
  fetchImpl: FetchLike = fetch,
): Promise<MicrosoftOAuthHealth> {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    const missing = [
      !clientId ? "MICROSOFT_CLIENT_ID" : null,
      !clientSecret ? "MICROSOFT_CLIENT_SECRET" : null,
    ].filter((name): name is string => name !== null);
    const reason = `missing ${missing.join(" and ")}`;
    logger.error(
      { provider: "microsoft", missing },
      `Microsoft OAuth credential health check FAILED: ${reason}. Microsoft sign-in is not configured.`,
    );
    return { configured: false, healthy: false, reason };
  }

  const redirectUri = `${getAppBaseUrl()}${MICROSOFT_CALLBACK_PATH}`;
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: "aio-fusion-credential-health-check",
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  try {
    const response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });

    let errorCode: string | undefined;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") errorCode = payload.error;
    } catch {
      // A non-JSON response is handled as an unhealthy provider response below.
    }

    // Microsoft returns invalid_grant for the intentionally fake code after
    // accepting the client credentials. Do not log the response body: error
    // descriptions can contain request details and are not needed here.
    if (response.ok || errorCode === "invalid_grant") {
      logger.info(
        { provider: "microsoft" },
        "Microsoft OAuth credential health check passed.",
      );
      return { configured: true, healthy: true };
    }

    const reason =
      errorCode === "invalid_client"
        ? "Microsoft rejected the client ID or client secret"
        : `Microsoft token endpoint returned HTTP ${response.status}${errorCode ? ` (${errorCode})` : ""}`;
    logger.error(
      { provider: "microsoft", status: response.status, errorCode },
      `Microsoft OAuth credential health check FAILED: ${reason}. Microsoft sign-in may be unavailable.`,
    );
    return { configured: true, healthy: false, reason };
  } catch (err) {
    const reason = "Microsoft token endpoint could not be reached";
    logger.error(
      { err, provider: "microsoft" },
      `Microsoft OAuth credential health check FAILED: ${reason}. Microsoft sign-in may be unavailable.`,
    );
    return { configured: true, healthy: false, reason };
  }
}