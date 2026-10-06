import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CookieConsent, CookiePreferencesButton } from "./CookieConsent";
import { CONSENT_KEY } from "../lib/cookieConsent";

beforeEach(() => { localStorage.clear(); document.getElementById("aio-analytics-loader")?.remove(); });
afterEach(cleanup);

describe("cookie choice panel", () => {
  it("offers an essential-only choice and can be reopened to accept and withdraw", () => {
    render(<><CookieConsent /><CookiePreferencesButton /></>);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.queryByRole("region", { name: "Cookie choices" })).toBeNull();
    expect(JSON.parse(localStorage.getItem(CONSENT_KEY)!).analytics).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cookie preferences" }));
    const toggle = screen.getByRole("checkbox", { name: /Analytics/i });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(document.getElementById("aio-analytics-loader")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cookie preferences" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Analytics/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(document.getElementById("aio-analytics-loader")).toBeNull();
  });
  it("closing the panel means essential only, never implied consent", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with essential cookies only" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_KEY)!).analytics).toBe(false);
  });
});
