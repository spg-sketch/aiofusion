import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../lib/contentAi", () => ({ apiBase: () => "" }));

import { SupportAdminPage } from "./SupportAdminPage";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_TICKET = {
  id: 1,
  accountUsername: "user1",
  displayName: "Test User",
  userRole: "client",
  projectId: null,
  category: "General",
  subject: "Login issue",
  description: "I cannot log in.",
  attachmentUrl: null,
  status: "open",
  adminNotes: null,
  hasAdminReply: false,
  userSeenReply: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const TICKET_WITH_EMAIL_FAILED = { ...BASE_TICKET, emailFailed: true };
const TICKET_EMAIL_CLEARED = { ...BASE_TICKET, emailFailed: false };

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetchStatic(ticket: typeof TICKET_WITH_EMAIL_FAILED) {
  return vi.spyOn(global, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && /\/api\/support\/tickets\/\d+\/messages/.test(url)) {
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "GET" && url.includes("/api/support/tickets")) {
        return new Response(JSON.stringify({ tickets: [ticket] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "PATCH" && url.includes("/api/support/tickets/1")) {
        return new Response(JSON.stringify({ ticket: TICKET_EMAIL_CLEARED }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SupportAdminPage - email failure indicator in list view", () => {
  beforeEach(() => {
    mockFetchStatic(TICKET_WITH_EMAIL_FAILED);
  });

  it("shows the 'Email delivery failed' badge in the subject column when emailFailed=true", async () => {
    render(<SupportAdminPage onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/email delivery failed/i)).toBeInTheDocument();
    });
  });

  it("does not show the badge when emailFailed=false", async () => {
    vi.restoreAllMocks();
    mockFetchStatic(TICKET_EMAIL_CLEARED);

    render(<SupportAdminPage onBack={() => {}} />);
    await waitFor(() => screen.getByText(/login issue/i));
    expect(screen.queryByText(/email delivery failed/i)).not.toBeInTheDocument();
  });
});

describe("SupportAdminPage - email failure banner in detail view", () => {
  it("shows the banner and 'Clear flag' button when emailFailed=true", async () => {
    mockFetchStatic(TICKET_WITH_EMAIL_FAILED);
    render(<SupportAdminPage onBack={() => {}} />);

    await waitFor(() => screen.getByText(/view →/i));
    fireEvent.click(screen.getByText(/view →/i));

    await waitFor(() => {
      expect(screen.getByText(/email delivery failed/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /clear flag/i })).toBeInTheDocument();
    });
  });

  it("does not show the banner when emailFailed=false", async () => {
    mockFetchStatic(TICKET_EMAIL_CLEARED);
    render(<SupportAdminPage onBack={() => {}} />);

    await waitFor(() => screen.getByText(/view →/i));
    fireEvent.click(screen.getByText(/view →/i));

    await waitFor(() => screen.getByText(/login issue/i));
    expect(screen.queryByRole("button", { name: /clear flag/i })).not.toBeInTheDocument();
  });
});

describe("SupportAdminPage - 'Clear flag' happy path", () => {
  it("removes the banner immediately after clicking 'Clear flag'", async () => {
    mockFetchStatic(TICKET_WITH_EMAIL_FAILED);
    render(<SupportAdminPage onBack={() => {}} />);

    await waitFor(() => screen.getByText(/view →/i));
    fireEvent.click(screen.getByText(/view →/i));

    const clearBtn = await screen.findByRole("button", { name: /clear flag/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /clear flag/i })).not.toBeInTheDocument();
    });
  });

  it("sends PATCH { emailFailed: false } to the correct endpoint", async () => {
    const fetchSpy = mockFetchStatic(TICKET_WITH_EMAIL_FAILED);
    render(<SupportAdminPage onBack={() => {}} />);

    await waitFor(() => screen.getByText(/view →/i));
    fireEvent.click(screen.getByText(/view →/i));

    const clearBtn = await screen.findByRole("button", { name: /clear flag/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      const patchCall = fetchSpy.mock.calls.find(
        ([, init]) => (init?.method ?? "").toUpperCase() === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string) as Record<string, unknown>;
      expect(body.emailFailed).toBe(false);
    });
  });

  it("after going back to the list, the 'Email delivery failed' badge is gone", async () => {
    let patched = false;
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();

        if (method === "GET" && /\/api\/support\/tickets\/\d+\/messages/.test(url)) {
          return new Response(JSON.stringify({ messages: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (method === "GET" && url.includes("/api/support/tickets")) {
          const ticket = patched ? TICKET_EMAIL_CLEARED : TICKET_WITH_EMAIL_FAILED;
          return new Response(JSON.stringify({ tickets: [ticket] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (method === "PATCH" && url.includes("/api/support/tickets/1")) {
          patched = true;
          return new Response(JSON.stringify({ ticket: TICKET_EMAIL_CLEARED }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    render(<SupportAdminPage onBack={() => {}} />);

    await waitFor(() => screen.getByText(/view →/i));
    fireEvent.click(screen.getByText(/view →/i));

    const clearBtn = await screen.findByRole("button", { name: /clear flag/i });
    fireEvent.click(clearBtn);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /clear flag/i })).not.toBeInTheDocument(),
    );

    const backBtn = screen.getByText(/all tickets/i);
    fireEvent.click(backBtn);

    await waitFor(() => screen.getByText(/view →/i));
    expect(screen.queryByText(/email delivery failed/i)).not.toBeInTheDocument();
  });
});
