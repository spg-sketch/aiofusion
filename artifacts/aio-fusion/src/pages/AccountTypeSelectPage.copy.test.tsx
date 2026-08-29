import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AccountTypeSelectPage from "./AccountTypeSelectPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountTypeSelectPage copy", () => {
  it("explains that the choice can be changed without saying not to worry", () => {
    render(<AccountTypeSelectPage onComplete={vi.fn()} onSignOut={vi.fn()} />);

    expect(screen.getByText(/You can update this in your account settings at a later stage/i)).toBeInTheDocument();
    expect(screen.queryByText(/Don't worry/i)).not.toBeInTheDocument();
  });
});