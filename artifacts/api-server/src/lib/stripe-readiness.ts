import { randomUUID } from "node:crypto";

export type StripeCheckoutReadiness =
  | { available: true }
  | { available: false; reason: "webhook_validation_pending" | "webhook_secret_mismatch" };

let checkoutReadiness: StripeCheckoutReadiness = {
  available: false,
  reason: "webhook_validation_pending",
};

export function setStripeCheckoutReadiness(readiness: StripeCheckoutReadiness): void {
  checkoutReadiness = readiness;
}

export function getStripeCheckoutReadiness(): StripeCheckoutReadiness {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.toLowerCase().trim();
  if (deploymentEnv !== "staging" && deploymentEnv !== "production") {
    return { available: true };
  }
  return checkoutReadiness;
}

const pendingProbes = new Map<string, (verified: boolean) => void>();

export function startStripeWebhookReadinessProbe(timeoutMs = 15_000): {
  probeId: string;
  verified: Promise<boolean>;
  cancel: () => void;
} {
  const probeId = randomUUID();
  let timeout: NodeJS.Timeout;
  const verified = new Promise<boolean>((resolve) => {
    const finish = (result: boolean) => {
      clearTimeout(timeout);
      pendingProbes.delete(probeId);
      resolve(result);
    };
    pendingProbes.set(probeId, finish);
    timeout = setTimeout(() => finish(false), timeoutMs);
    timeout.unref?.();
  });
  return {
    probeId,
    verified,
    cancel: () => pendingProbes.get(probeId)?.(false),
  };
}

export function observeStripeWebhookReadinessProbe(event: {
  type: string;
  data?: { object?: unknown };
}): void {
  if (event.type !== "customer.created") return;
  const object = event.data?.object;
  if (!object || typeof object !== "object" || !("metadata" in object)) return;
  const metadata = (object as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return;
  const probeId = (metadata as Record<string, unknown>)["aio_webhook_readiness_probe"];
  if (typeof probeId !== "string") return;
  if (probeId) pendingProbes.get(probeId)?.(true);
}