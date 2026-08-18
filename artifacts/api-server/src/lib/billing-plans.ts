// Confirmed AIO Fusion pricing (all excl. VAT, indicative during Beta).
// Amounts are in pence (GBP). Quarterly plans bill every 3 months at a
// quarter of the yearly-when-quarterly total.

export type PlanKey = "inhouse" | "agency";
export type BillingFrequency = "annual" | "quarterly";
export type ProjectTier = "standard" | "premium" | "max";

// Actions per project per rolling 30 days, by tier.
export const TIER_ACTION_LIMITS: Record<ProjectTier, number> = {
  standard: 50,
  premium: 75,
  max: 150,
};

// Projects included in each plan are Premium-tier workspaces.
export const INCLUDED_PROJECT_TIER: ProjectTier = "premium";
export const INCLUDED_PROJECTS: Record<PlanKey, number> = {
  inhouse: 1,
  agency: 3,
};

export interface PlanPrice {
  lookupKey: string;
  productName: string;
  // Amount in pence charged per billing interval.
  unitAmount: number;
  // Total per year, for display.
  yearlyTotal: number;
  interval: "year" | "month";
  intervalCount: number;
}

// Subscription plans. lookup_key is the stable handle used to resolve the
// live Stripe price id at runtime - never hardcode price_... ids.
export const PLAN_PRICES: Record<PlanKey, Record<BillingFrequency, PlanPrice>> = {
  inhouse: {
    annual: {
      lookupKey: "aio-inhouse-annual",
      productName: "AIO Fusion In-House",
      unitAmount: 400_000, // £4,000.00 / year
      yearlyTotal: 400_000,
      interval: "year",
      intervalCount: 1,
    },
    quarterly: {
      lookupKey: "aio-inhouse-quarterly",
      productName: "AIO Fusion In-House",
      unitAmount: 115_000, // £1,150.00 / quarter (£4,600/yr)
      yearlyTotal: 460_000,
      interval: "month",
      intervalCount: 3,
    },
  },
  agency: {
    annual: {
      lookupKey: "aio-agency-annual",
      productName: "AIO Fusion Agency/Partner",
      unitAmount: 500_000, // £5,000.00 / year
      yearlyTotal: 500_000,
      interval: "year",
      intervalCount: 1,
    },
    quarterly: {
      lookupKey: "aio-agency-quarterly",
      productName: "AIO Fusion Agency/Partner",
      unitAmount: 143_750, // £1,437.50 / quarter (£5,750/yr)
      yearlyTotal: 575_000,
      interval: "month",
      intervalCount: 3,
    },
  },
};

// Additional-project tiers (per project, per year). Checkout for these is a
// follow-up task; they are seeded now so prices exist in Stripe.
export const PROJECT_TIER_PRICES: Record<ProjectTier, PlanPrice> = {
  standard: {
    lookupKey: "aio-project-standard",
    productName: "AIO Fusion Additional Project - Standard",
    unitAmount: 50_000, // £500 / year
    yearlyTotal: 50_000,
    interval: "year",
    intervalCount: 1,
  },
  premium: {
    lookupKey: "aio-project-premium",
    productName: "AIO Fusion Additional Project - Premium",
    unitAmount: 65_000, // £650 / year
    yearlyTotal: 65_000,
    interval: "year",
    intervalCount: 1,
  },
  max: {
    lookupKey: "aio-project-max",
    productName: "AIO Fusion Additional Project - Max",
    unitAmount: 80_000, // £800 / year
    yearlyTotal: 80_000,
    interval: "year",
    intervalCount: 1,
  },
};

export function isPlanKey(v: unknown): v is PlanKey {
  return v === "inhouse" || v === "agency";
}

export function isBillingFrequency(v: unknown): v is BillingFrequency {
  return v === "annual" || v === "quarterly";
}

export function isProjectTier(v: unknown): v is ProjectTier {
  return v === "standard" || v === "premium" || v === "max";
}
