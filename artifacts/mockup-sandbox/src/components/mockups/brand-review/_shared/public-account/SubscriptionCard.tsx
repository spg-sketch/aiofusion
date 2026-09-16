import type { ReactNode } from "react";
export type SubscriptionActivationSummary = { currentPeriodEnd?: string | null; frequency: "quarterly" | "annual"; plan: "agency" | "inhouse" };
export function daysUntilRenewal(_date?: string | null): number | null { return null; }
export function formatSubscriptionEnd(date?: string | null): string | null { return date ? new Date(date).toLocaleDateString() : null; }
export function SubscriptionCard(_props: { children?: ReactNode; onAccessActivated?: (summary: SubscriptionActivationSummary) => void; [key: string]: any }) { return <div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Choose your plan</p><p className="mt-2 text-sm text-slate-600">Plan and payment options are illustrative in this preview.</p></div>; }
