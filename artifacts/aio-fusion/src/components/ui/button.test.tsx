import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";

afterEach(cleanup);

describe("product button variants", () => {
  it("preserves the accessible name, activation and return destination", () => {
    const onClick = vi.fn();
    render(<Button variant="navigation" onClick={onClick}>Back to platform</Button>);
    const button = screen.getByRole("button", { name: "Back to platform" });
    expect(button.className).toContain("cursor-pointer");
    expect(button.className).toContain("min-h-11");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not activate disabled or loading actions", () => {
    const onClick = vi.fn();
    render(<Button disabled aria-busy="true" onClick={onClick}>Saving</Button>);
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("preserves link semantics and compact sizing", () => {
    render(<Button asChild variant="text" size="compact"><a href="#agency">Back to agency</a></Button>);
    const link = screen.getByRole("link", { name: "Back to agency" });
    expect(link).toHaveAttribute("href", "#agency");
    expect(link.className).toContain("min-h-9");
  });
});