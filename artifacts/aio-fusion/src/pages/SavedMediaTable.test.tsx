// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SavedMediaTable } from "./SavedMediaTable";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("offers scroll controls only when columns exceed the available width", () => {
  render(<SavedMediaTable type="contacts" sector="Energy"><table><tbody><tr><td>Long text</td></tr></tbody></table></SavedMediaTable>);
  const region = screen.getByRole("region", { name: "Saved contacts in Energy" });
  expect(region).toHaveAttribute("tabindex", "0");
  expect(screen.queryByText(/Scroll sideways/)).toBeNull();
  Object.defineProperties(region, {
    scrollWidth: { configurable: true, value: 680 },
    clientWidth: { configurable: true, value: 320 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
    scrollBy: { configurable: true, value: vi.fn() },
  });
  fireEvent(window, new Event("resize"));
  expect(screen.getByText(/Scroll sideways/).id).toBe(region.getAttribute("aria-describedby"));
  expect(screen.getByRole("button", { name: "Scroll Energy contacts left" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Scroll Energy contacts right" }));
  expect(region.scrollBy).toHaveBeenCalledWith({ left: 240, behavior: "smooth" });
  region.scrollLeft = 360;
  fireEvent.scroll(region);
  expect(screen.getByRole("button", { name: "Scroll Energy contacts right" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Scroll Energy contacts left" }));
  expect(region.scrollBy).toHaveBeenLastCalledWith({ left: -240, behavior: "smooth" });
  Object.defineProperty(region, "clientWidth", { configurable: true, value: 800 });
  region.scrollLeft = 0;
  fireEvent(window, new Event("resize"));
  expect(screen.queryByText(/Scroll sideways/)).toBeNull();
});