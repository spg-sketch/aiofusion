import { logger } from "./logger";
import { sendStripeWebhookFailureAlert } from "./notify-email";

export type StripeWebhookFailureClass = "signature_verification" | "event_processing";

type FailureState = {
  consecutiveFailures: number;
  alertActive: boolean;
};

export const STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD = 3;

function environmentName(): string {
  return process.env.DEPLOYMENT_ENV?.trim().toLowerCase()
    || process.env.NODE_ENV?.trim().toLowerCase()
    || "unknown";
}

export class StripeWebhookHealthMonitor {
  private readonly states: Record<StripeWebhookFailureClass, FailureState> = {
    signature_verification: { consecutiveFailures: 0, alertActive: false },
    event_processing: { consecutiveFailures: 0, alertActive: false },
  };

  async recordFailure(failureClass: StripeWebhookFailureClass): Promise<void> {
    const state = this.states[failureClass];
    state.consecutiveFailures += 1;

    logger.warn(
      {
        failureClass,
        consecutiveFailures: state.consecutiveFailures,
        alertActive: state.alertActive,
      },
      "stripe webhook health: failure recorded",
    );

    if (
      state.alertActive
      || state.consecutiveFailures < STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD
    ) {
      return;
    }

    // Latch before sending so a provider outage cannot turn every subsequent
    // webhook retry into another alert attempt.
    state.alertActive = true;
    await sendStripeWebhookFailureAlert({
      environment: environmentName(),
      failureClass,
      consecutiveFailures: state.consecutiveFailures,
    });
  }

  recordSuccess(failureClass: StripeWebhookFailureClass): void {
    const state = this.states[failureClass];
    if (state.consecutiveFailures === 0 && !state.alertActive) return;

    logger.info(
      {
        failureClass,
        recoveredAfterFailures: state.consecutiveFailures,
        clearedAlert: state.alertActive,
      },
      "stripe webhook health: failure state cleared after recovery",
    );
    state.consecutiveFailures = 0;
    state.alertActive = false;
  }

  reset(): void {
    for (const state of Object.values(this.states)) {
      state.consecutiveFailures = 0;
      state.alertActive = false;
    }
  }
}

export const stripeWebhookHealth = new StripeWebhookHealthMonitor();