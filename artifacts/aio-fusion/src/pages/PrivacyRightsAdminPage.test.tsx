// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
vi.mock("../lib/contentAi", () => ({ apiBase: () => "" }));
import { PrivacyRightsAdminPage } from "./PrivacyRightsAdminPage";

describe("privacy rights admin API gates", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/admin/journalist-privacy/requests/1")) return new Response(JSON.stringify({ request: { id: 1, requestType: "removal", status: "under_review", verificationStatus: "verified", name: "A", email: "a@example.com", details: "Review", scope: "workspace" }, events: [] }), { status: 200 });
      return new Response(JSON.stringify({ requests: [{ id: 1, requestType: "removal", status: "under_review", dueAt: new Date(Date.now() + 86400000).toISOString() }] }), { status: 200 });
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("fetches list/detail endpoints and gates approval until match, account and note", async () => {
    render(<PrivacyRightsAdminPage onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText("removal request")).toBeTruthy());
    fireEvent.click(screen.getByText("removal request"));
    await waitFor(() => expect(screen.getByText("Search candidate matches")).toBeTruthy());
    const approve = screen.getByText("Approve matched contacts") as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("/api/admin/journalist-privacy/requests/1");
  });

  it("submits correction fields, values and evidence and keeps queued cases unresolved", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      calls.push([input, init]);
      const url = String(input);
      if (url.includes("/requests?")) return new Response(JSON.stringify({ requests: [{ id: 1, requestType: "correction", status: "under_review", dueAt: new Date(Date.now() + 86400000).toISOString() }] }));
      if (url.endsWith("/requests/1")) return new Response(JSON.stringify({ request: { id: 1, requestType: "correction", status: "under_review", verificationStatus: "verified", name: "A", email: "a@example.com", scope: "workspace", approvedScope: "workspace", approvedAccountId: "workspace-a", matchedContactIds: [7] }, events: [] }));
      if (url.includes("/resolve")) return new Response(JSON.stringify({ error: "Correction report queued; steward acceptance is required before closure." }), { status: 409 });
      return new Response(JSON.stringify({ requests: [] }));
    });
    render(<PrivacyRightsAdminPage onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText("correction request")).toBeTruthy());
    fireEvent.click(screen.getByText("correction request"));
    await waitFor(() => expect(screen.getByText("Actionable correction for steward review")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Correct Email"));
    fireEvent.change(screen.getByLabelText("Proposed Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Correction evidence"), { target: { value: "Verified steward evidence" } });
    fireEvent.change(screen.getByLabelText("Required review note"), { target: { value: "Queue correction" } });
    fireEvent.click(screen.getByText("Resolve case"));
    await waitFor(() => expect(screen.getByText("Correction report queued; steward acceptance is required before closure.")).toBeTruthy());
    const resolve = calls.find(([, init]) => String(init?.body).includes('"correction"'));
    expect(resolve).toBeTruthy();
    expect(JSON.parse(String(resolve?.[1]?.body))).toMatchObject({
      resolution: "upheld", correction: { fields: ["email"], values: { email: "new@example.com" }, evidence: "Verified steward evidence" },
    });
    expect(screen.getByText("under_review")).toBeTruthy();
  });
});