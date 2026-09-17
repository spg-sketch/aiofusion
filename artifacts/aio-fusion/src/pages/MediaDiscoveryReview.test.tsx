// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/contentAi", () => ({ apiBase: () => "" }));

import MediaDiscoveryReview from "./MediaDiscoveryReview";

const pendingItem = {
  id: 42,
  status: "pending",
  candidate: {
    firstName: "Avery",
    lastName: "Reporter",
    role: "Editor",
    outletName: "Evidence Daily",
    evidence: "A public profile says Avery covers energy policy. <unsafe>",
    sourceUrl: "javascript:alert(1)",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
};

let requests: { url: string; init?: RequestInit }[];
let canReview = true;
let approveResponse: Response;
let rejectResponse: Response;
let getItems: unknown[] = [pendingItem];

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("MediaDiscoveryReview", () => {
  beforeEach(() => {
    requests = [];
    canReview = true;
    getItems = [pendingItem];
    approveResponse = response({ ok: true });
    rejectResponse = response({ ok: true });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/approve")) return approveResponse.clone();
      if (url.includes("/reject")) return rejectResponse.clone();
      return response({ ok: true, items: getItems, canReview });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders immutable evidence and rejects unsafe source URLs", async () => {
    render(<MediaDiscoveryReview />);
    expect(await screen.findByTestId("card-discovery-42")).toBeTruthy();
    expect(screen.getByText(/A public profile says Avery covers energy policy/)).toBeTruthy();
    expect(screen.queryByTestId("link-source-42")).toBeNull();
  });

  it("approves through the exact endpoint, refetches, and notifies the owner", async () => {
    const onApproved = vi.fn();
    render(<MediaDiscoveryReview onApproved={onApproved} />);
    await screen.findByTestId("card-discovery-42");
    getItems = [];

    fireEvent.click(screen.getByTestId("button-approve-42"));
    await waitFor(() => expect(requests.some(({ url, init }) =>
      url === "/api/store/media-db/discoveries/42/approve" && init?.method === "POST",
    )).toBe(true));
    await waitFor(() => expect(requests.filter(({ url, init }) =>
      url === "/api/store/media-db/discoveries?status=pending" && !init?.method,
    )).toHaveLength(2));
    expect(onApproved).toHaveBeenCalledTimes(1);
    expect(requests.find(({ url }) => url.includes("/approve"))?.init).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(screen.getByText(/no pending discoveries/i)).toBeTruthy();
  });

  it("persists a rejection reason without approving or contacting the candidate", async () => {
    render(<MediaDiscoveryReview />);
    await screen.findByTestId("card-discovery-42");
    getItems = [];

    fireEvent.click(screen.getByTestId("button-reject-42"));
    fireEvent.change(screen.getByTestId("input-reject-reason-42"), {
      target: { value: "The cited page does not support this claim." },
    });
    fireEvent.click(screen.getByTestId("button-confirm-reject-42"));

    await waitFor(() => expect(requests.some(({ url, init }) =>
      url.endsWith("/discoveries/42/reject") && init?.method === "POST",
    )).toBe(true));
    const reject = requests.find(({ url }) => url.endsWith("/discoveries/42/reject"));
    expect(JSON.parse(String(reject?.init?.body))).toEqual({
      reason: "The cited page does not support this claim.",
    });
    expect(requests.some(({ url }) => url.includes("/approve") || url.includes("/contact"))).toBe(false);
  });

  it.each([
    [403, /Approval failed \(403\)/],
    [409, /already reviewed/i],
  ] as const)("shows an approval %s failure without claiming success", async (status, message) => {
    approveResponse = response({ error: "not allowed" }, status);
    const onApproved = vi.fn();
    render(<MediaDiscoveryReview onApproved={onApproved} />);
    await screen.findByTestId("card-discovery-42");
    fireEvent.click(screen.getByTestId("button-approve-42"));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByTestId("card-discovery-42")).toBeTruthy();
    expect(onApproved).not.toHaveBeenCalled();
    expect(screen.queryByTestId("status-success")).toBeNull();
  });

  it("shows a rejection conflict and keeps the draft card", async () => {
    rejectResponse = response({ error: "already reviewed" }, 409);
    render(<MediaDiscoveryReview />);
    await screen.findByTestId("card-discovery-42");
    fireEvent.click(screen.getByTestId("button-reject-42"));
    fireEvent.click(screen.getByTestId("button-confirm-reject-42"));

    expect(await screen.findByText(/already reviewed/i)).toBeTruthy();
    expect(screen.getByTestId("card-discovery-42")).toBeTruthy();
  });

  it("renders read-only pending actions as disabled and never mutates", async () => {
    canReview = false;
    render(<MediaDiscoveryReview />);
    await screen.findByTestId("card-discovery-42");

    expect(screen.getByTestId("button-approve-42")).toBeDisabled();
    expect(screen.getByTestId("button-reject-42")).toBeDisabled();
    fireEvent.click(screen.getByTestId("button-approve-42"));
    fireEvent.click(screen.getByTestId("button-reject-42"));
    expect(requests.some(({ init }) => init?.method === "POST")).toBe(false);
  });

  it("ignores a stale response when the status filter changes", async () => {
    const resolvers: ((value: Response) => void)[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      return new Promise<Response>((resolve) => resolvers.push(resolve));
    }));

    render(<MediaDiscoveryReview />);
    fireEvent.click(screen.getByTestId("tab-filter-approved"));
    await waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[1](response({
      ok: true,
      canReview: true,
      items: [{ ...pendingItem, id: 99, status: "approved", candidate: { ...pendingItem.candidate, firstName: "Newest" } }],
    }));
    await screen.findByTestId("card-discovery-99");
    resolvers[0](response({ ok: true, canReview: true, items: [pendingItem] }));
    await waitFor(() => expect(screen.queryByTestId("card-discovery-42")).toBeNull());
    expect(screen.getByText("Newest Reporter")).toBeTruthy();
  });
});