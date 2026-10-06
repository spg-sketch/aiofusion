import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return { ...actual, serverSwitchWorkspace: vi.fn() };
});
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { GenerationProgress } from "../lib/contentAi";
import { serverSwitchWorkspace } from "../lib/auth";

describe("platform readability", () => {
  it("shows the active workspace and alternatives in a legible selector on a dark header", () => {
    render(
      <WorkspaceSwitcher
        workspaces={[
          { companyId: "one", companySlug: "natalie", companyName: "Natalie's team", companyRole: "client", membershipRole: "owner", isActive: true },
          { companyId: "two", companySlug: "admin", companyName: "Admin", companyRole: "admin", membershipRole: "owner", isActive: false },
        ]}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Switch workspace" }) as HTMLSelectElement;
    expect(select.value).toBe("one");
    expect(within(select).getAllByRole("option")).toHaveLength(2);
    expect(select.closest("div")?.className).toContain("bg-white");
    expect(select.style.color).toBe("rgb(10, 22, 40)");
    expect(screen.getByText("Workspace").tagName).toBe("LABEL");
    expect(select.style.colorScheme).toBe("light");
    expect(within(select).getByRole("option", { name: "Natalie's team" }).style.color).toBe("rgb(10, 22, 40)");
  });

  it("keeps progress guidance and the current stage dark enough to read", () => {
    render(
      <GenerationProgress
        stages={["Drafting the article"]}
        chars={0}
        accent="#C8497A"
        textColor="#0a1628"
        durationSeconds={90}
      />,
    );

    expect(screen.getByText("Drafting the article…").style.color).toBe("rgb(10, 22, 40)");
    const guidance = screen.getByText(/keep this browser tab open/i);
    expect(guidance.className).toContain("text-[12px]");
    expect(guidance.style.color).toBe("rgb(51, 65, 85)");
  });

  it("keeps switching guarded and reports a failure without changing the active workspace", async () => {
    vi.mocked(serverSwitchWorkspace).mockReset();
    vi.mocked(serverSwitchWorkspace).mockResolvedValue({ ok: false, error: "Workspace is unavailable." });
    let pending: (() => void) | undefined;
    render(<WorkspaceSwitcher
      workspaces={[
        { companyId: "one", companySlug: "first", companyName: "", companyRole: "client", membershipRole: "owner", isActive: true },
        { companyId: "two", companySlug: "second", companyName: "Second workspace", companyRole: "client", membershipRole: "owner", isActive: false },
      ]}
      requestAction={(run) => { pending = run; return false; }}
    />);
    const select = screen.getByRole("combobox", { name: "Switch workspace" });
    expect(within(select).getByRole("option", { name: "first" })).toBeTruthy();
    fireEvent.change(select, { target: { value: "two" } });
    expect(serverSwitchWorkspace).not.toHaveBeenCalled();
    pending?.();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Workspace is unavailable."));
    expect(serverSwitchWorkspace).toHaveBeenCalledWith("two");
    expect(screen.getByRole("combobox", { name: "Switch workspace" })).toHaveValue("one");
  });
});