// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LandingPage from "./LandingPage";

describe("homepage demo enquiry", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("opens only on the first visit, dismisses with Escape and reopens on request", () => {
    const props = { onLogin: vi.fn(), onNavigate: vi.fn() };
    const page = render(<LandingPage {...props} />);
    expect(screen.getByRole("dialog", { name: /see your ai visibility/i })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close demo enquiry/i }));
    act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    page.unmount();
    render(<LandingPage {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /book a demo/i })[0]!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("sends enquiries through the existing contact endpoint and confirms success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Test Visitor" } });
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "visitor@example.test" } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Example Co" } });
    fireEvent.change(screen.getByLabelText(/what are you hoping to achieve/i), { target: { value: "See an audit" } });
    fireEvent.click(screen.getByRole("button", { name: /request a demo/i }));
    await waitFor(() => expect(screen.getByText("Request received")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/api\/contact\/book-demo$/),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Test Visitor", email: "visitor@example.test", company: "Example Co", goal: "See an audit" }) }),
    );
  });
});