// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LandingPage from "./LandingPage";
import DemoDialog from "./DemoDialog";
import { CONSENT_KEY } from "../lib/cookieConsent";
import * as cookieConsent from "../lib/cookieConsent";
import { CookieConsent } from "../components/CookieConsent";

describe("homepage demo enquiry", () => {
  beforeEach(() => {
    localStorage.clear();
    // Returning visitors have already made a choice; first visits are tested
    // separately so an automatic demo never competes with cookie consent.
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, analytics: false, savedAt: Date.now() }));
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("opens on returning homepage visits, dismisses with Escape and reopens on request", () => {
    const props = { onLogin: vi.fn(), onNavigate: vi.fn() };
    const page = render(<LandingPage {...props} />);
    expect(screen.getByRole("dialog", { name: /see your ai visibility/i })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close demo enquiry/i }));
    act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    page.unmount();
    render(<LandingPage {...props} />);
    expect(screen.getByRole("dialog", { name: /see your ai visibility/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /close demo enquiry/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /book a demo/i })[0]!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not automatically open the demo before a first-visit cookie choice", () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /book a demo/i })[0]!);
    expect(screen.getByRole("dialog", { name: /see your ai visibility/i })).toBeTruthy();
  });
  it("opens after a cookie choice made during app loading, without waiting for another event", () => {
    vi.spyOn(cookieConsent, "hasCookiePreferenceOnArrival").mockReturnValue(false);
    render(<LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it.each(["Essential only", "Allow analytics", "Continue with essential cookies only"])(
    "opens once after %s closes the first-visit notice, without a refresh",
    (choice) => {
      localStorage.removeItem(CONSENT_KEY);
      render(<><LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} /><CookieConsent /></>);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("region", { name: "Cookie choices" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: choice }));
      expect(screen.queryByRole("region", { name: "Cookie choices" })).toBeNull();
      expect(screen.getByRole("dialog")).toBeTruthy();
      if (choice !== "Allow analytics") expect(document.getElementById("aio-analytics-loader")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /close demo enquiry/i }));
      act(() => cookieConsent.saveCookiePreference(false));
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("waits for a renewed choice when the saved preference has expired", () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, analytics: false, savedAt: Date.now() - 181 * 86400000 }));
    render(<><LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} /><CookieConsent /></>);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("preserves opt-out after a first-visit choice and still allows manual opening", () => {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.setItem("aio-demo-opt-out", "1");
    render(<><LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} /><CookieConsent /></>);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /book a demo/i })[0]!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not reopen a manually dismissed demo after the first cookie choice", () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /book a demo/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /close demo enquiry/i }));
    act(() => cookieConsent.saveCookiePreference(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("removes its consent listener when leaving the homepage", () => {
    localStorage.removeItem(CONSENT_KEY);
    const page = render(<LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} />);
    const remove = vi.spyOn(window, "removeEventListener");
    page.unmount();
    expect(remove).toHaveBeenCalledWith(cookieConsent.CONSENT_EVENT, expect.any(Function));
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens after an in-tab essential choice when browser storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<><LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} /><CookieConsent /></>);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Cookie choices" })).toBeNull();
  });

  it("opens even if an earlier visit left the old storage flag", () => {
    localStorage.setItem("aio-demo-introduced", "1");
    const props = { onLogin: vi.fn(), onNavigate: vi.fn() };
    render(<LandingPage {...props} />);
    expect(screen.getByRole("dialog", { name: /see your ai visibility/i })).toBeTruthy();
  });

  it("respects the opt-out on later visits but still lets visitors reopen and undo it", () => {
    const props = { onLogin: vi.fn(), onNavigate: vi.fn() };
    const page = render(<LandingPage {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /don't show this again/i }));
    expect(localStorage.getItem("aio-demo-opt-out")).toBe("1");
    page.unmount();

    const returnVisit = render(<LandingPage {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /book a demo/i })[0]!);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /don't show this again/i }).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /don't show this again/i }));
    expect(localStorage.getItem("aio-demo-opt-out")).toBeNull();
    returnVisit.unmount();

    render(<LandingPage {...props} />);
    expect(screen.getByRole("dialog", { name: /see your ai visibility/i })).toBeTruthy();
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

  it("traps focus both ways, restores the opener and restores background scrolling", () => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "auto";
    render(<LandingPage onLogin={vi.fn()} onNavigate={vi.fn()} />);
    const close = screen.getByRole("button", { name: /close demo enquiry/i });
    const preference = screen.getByRole("checkbox");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(preference);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("auto");
    expect(document.body.style.position).toBe("");
    const opener = screen.getAllByRole("button", { name: /book a demo/i })[0]!;
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: /close demo enquiry/i }));
    expect(document.activeElement).toBe(opener);
    document.body.style.overflow = original;
  });

  it("does not refocus close or overwrite the return target when the parent rerenders", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const page = render(<DemoDialog onClose={vi.fn()} />);
    const field = screen.getByLabelText(/your name/i);
    field.focus();
    page.rerender(<DemoDialog onClose={vi.fn()} />);
    expect(document.activeElement).toBe(field);
    page.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("keeps hidden controls outside focus traversal and recovers focus from outside", () => {
    render(<DemoDialog onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const hidden = document.createElement("div");
    hidden.style.display = "none";
    hidden.innerHTML = "<button>Hidden action</button>";
    dialog.append(hidden);
    screen.getByRole("checkbox").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close demo enquiry/i }));
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    outside.remove();
  });

  it("tracks the visual viewport and reveals the focused field after keyboard-like resizing", () => {
    const viewport = Object.assign(new EventTarget(), { height: 600, width: 375, offsetTop: 0, offsetLeft: 0 });
    vi.stubGlobal("visualViewport", viewport);
    const page = render(<DemoDialog onClose={vi.fn()} />);
    const overlay = screen.getByRole("dialog").parentElement!;
    expect(overlay.style.getPropertyValue("--demo-viewport-height")).toBe("600px");
    viewport.height = 260;
    viewport.offsetTop = 40;
    viewport.dispatchEvent(new Event("resize"));
    expect(overlay.style.getPropertyValue("--demo-viewport-height")).toBe("260px");
    expect(overlay.style.getPropertyValue("--demo-viewport-top")).toBe("40px");
    const field = screen.getByLabelText(/what are you hoping to achieve/i);
    const reveal = vi.fn();
    field.scrollIntoView = reveal;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    field.focus();
    expect(reveal).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    page.unmount();
    viewport.height = 300;
    viewport.dispatchEvent(new Event("resize"));
    expect(overlay.style.getPropertyValue("--demo-viewport-height")).toBe("260px");
  });

  it("shows failed delivery without losing fields or the preference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Please try later" }) }));
    render(<DemoDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Test Visitor" } });
    fireEvent.submit(screen.getByRole("button", { name: /request a demo/i }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Please try later"));
    expect((screen.getByLabelText(/your name/i) as HTMLInputElement).value).toBe("Test Visitor");
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });

  it("separates primary and legal footer links, preserving URLs and navigation", () => {
    const onNavigate = vi.fn();
    render(<LandingPage onLogin={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.keyDown(document, { key: "Escape" });
    const footer = within(screen.getByRole("contentinfo"));
    const primary = within(footer.getByRole("navigation", { name: "Footer navigation" }));
    const legal = within(footer.getByRole("navigation", { name: "Footer legal navigation" }));
    const primaryLinks = [
      ["Features", "#features"],
      ["For In-house", "for-inhouse"],
      ["For PR Agencies", "for-agencies"],
      ["For Agents", "for-agents"],
      ["Insights", "insights"],
      ["Contact", "contact"],
      ["About", "about"],
    ];
    const legalLinks = [
      ["Trust & Security", "trust-security"],
      ["Privacy Policy", "privacy-policy"],
      ["Website terms", "website-terms"],
      ["Platform terms", "terms-conditions"],
      ["Cookie policy", "cookie-policy"],
      ["Legal review", "legal-review"],
    ];
    expect(primary.getAllByRole("link").map((link) => link.textContent)).toEqual(primaryLinks.map(([label]) => label));
    expect(legal.getAllByRole("link").map((link) => link.textContent)).toEqual(legalLinks.map(([label]) => label));
    expect(primary.getByRole("list")).toBeTruthy();
    expect(legal.getByRole("list")).toBeTruthy();
    expect(legal.getByRole("button", { name: "Cookie preferences" })).toBeTruthy();
    for (const [group, links] of [[primary, primaryLinks], [legal, legalLinks]] as const) {
      for (const [label, destination] of links) {
        const link = group.getByRole("link", { name: label });
        expect(link.getAttribute("href")).toBe(destination === "#features" ? destination : `${import.meta.env.BASE_URL}${destination}`);
        link.focus();
        expect(document.activeElement).toBe(link);
        onNavigate.mockClear();
        const prevented = !fireEvent.click(link);
        if (destination === "#features") {
          expect(onNavigate).not.toHaveBeenCalled();
          expect(prevented).toBe(false);
        } else {
          expect(onNavigate).toHaveBeenCalledExactlyOnceWith(destination);
          expect(prevented).toBe(true);
        }
      }
    }
    expect(footer.getByText("© AIO Fusion 2026").classList.contains("whitespace-nowrap")).toBe(true);
    expect(footer.getByRole("img", { name: "AIO Fusion" }).getAttribute("src")).toBe(`${import.meta.env.BASE_URL}images/logo-color.png`);
  });
});