import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

type StripeConnectionItem = {
  environment?: string | null;
  disabled?: boolean;
  status?: string | null;
  settings?: {
    secret?: string;
    secret_key?: string;
    webhook_secret?: string;
  };
  webhook_config?: { secret?: string; webhook_secret?: string } | null;
};

function stripeKeyFor(item: StripeConnectionItem): string | undefined {
  return item.settings?.secret ?? item.settings?.secret_key;
}

function stripeKeyMode(key: string | undefined): "test" | "live" | null {
  if (/^(sk|rk)_test_/.test(key ?? "")) return "test";
  if (/^(sk|rk)_live_/.test(key ?? "")) return "live";
  return null;
}

/**
 * Replit exposes the Stripe sandbox as the `development` connection and the
 * live account as the `production` connection. The API may return both, and
 * their order is not stable between the workspace and a deployment.
 */
export function selectStripeConnectionItem(items: StripeConnectionItem[]): StripeConnectionItem {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.toLowerCase().trim();
  const wantsLive = deploymentEnv === "production";
  const wantedEnvironment = wantsLive ? "production" : "development";
  const wantedMode = wantsLive ? "live" : "test";
  const usable = items.filter((item) => !item.disabled && stripeKeyFor(item));

  const selected =
    usable.find(
      (item) =>
        item.environment?.toLowerCase() === wantedEnvironment &&
        stripeKeyMode(stripeKeyFor(item)) === wantedMode,
    ) ??
    usable.find((item) => stripeKeyMode(stripeKeyFor(item)) === wantedMode);

  if (!selected) {
    const currentEnv = deploymentEnv || process.env.NODE_ENV || "development";
    throw new Error(
      `Stripe ${wantedMode} credentials are not connected for ${currentEnv}. ` +
        `Refusing to use Stripe credentials from another environment.`,
    );
  }

  return selected;
}

/**
 * Fetches Stripe credentials from the Replit connection API.
 * Not cached - tokens can rotate, so fetch fresh each time.
 */
export async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  if (process.env.DEPLOYMENT_ENV?.toLowerCase().trim() === "staging") {
    const stagingSecretKey = process.env.STRIPE_STAGING_SECRET_KEY?.trim();
    if (stagingSecretKey) {
      if (!/^(sk|rk)_test_/.test(stagingSecretKey)) {
        throw new Error(
          "STRIPE_STAGING_SECRET_KEY must be a Stripe test key. " +
            "Refusing to use a non-test Stripe key on staging.",
        );
      }
      return { secretKey: stagingSecretKey };
    }
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Missing Replit environment variables. " +
        "Ensure the Stripe integration is connected via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as { items?: StripeConnectionItem[] };
  const item = selectStripeConnectionItem(data.items ?? []);
  // The connection exposes the API key as `secret` (older shapes used
  // `secret_key`); accept either.
  const secretKey = item?.settings?.secret ?? item?.settings?.secret_key;

  if (!secretKey) {
    throw new Error(
      "Stripe integration not connected or missing secret key. " +
        "Connect Stripe via the Integrations tab first.",
    );
  }

  return {
    secretKey,
    webhookSecret:
      item?.settings?.webhook_secret ??
      item?.webhook_config?.webhook_secret ??
      item?.webhook_config?.secret,
  };
}

/** Whether the Replit Stripe connection is available in this environment. */
export function stripeConfigured(): boolean {
  return Boolean(
    process.env.REPLIT_CONNECTORS_HOSTNAME &&
      (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL),
  );
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached - fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
