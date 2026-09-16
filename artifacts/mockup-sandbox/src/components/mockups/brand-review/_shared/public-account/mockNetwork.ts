type MockResponse = { ok: boolean; json: () => Promise<any> };
let onboardingState: { step: "account_type" | "workspace_basics" | "access" | "billing" | "first_project"; accessChoice?: "beta" | "paid" } = { step: "workspace_basics" };
export function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<MockResponse> {
  const path = String(input);
  const method = init?.method ?? "GET";
  if (path.includes("/onboarding")) {
    if (method === "POST") {
      try { const body = JSON.parse(String(init?.body ?? "{}")); if (path.includes("/access")) { onboardingState = body.choice === "paid" ? { step: "billing", accessChoice: "paid" } : { step: "first_project", accessChoice: "beta" }; } else if (path.includes("/workspace-basics")) onboardingState = { step: "access" }; } catch { /* invalid preview input stays in memory */ }
    }
    return Promise.resolve({ ok: true, json: async () => ({ state: onboardingState }) });
  }
  if (path.includes("/platform/me")) return Promise.resolve({ ok: true, json: async () => ({ account: { googleLinked: false, microsoftLinked: false }, masterOwner: false, accountProfile: { displayName: "Northstar Communications", website: "https://northstar.example", workspaceNameNeedsReview: false } }) });
  if (path.includes("/profile/image")) return Promise.resolve({ ok: method !== "GET", json: async () => ({}) });
  return Promise.resolve({ ok: true, json: async () => ({}) });
}
