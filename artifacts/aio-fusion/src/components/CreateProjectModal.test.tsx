import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateProjectModal } from "./CreateProjectModal";

afterEach(cleanup);

describe("CreateProjectModal", () => {
  it("keeps the existing void-returning Project Hub contract", async () => {
    const onCancel = vi.fn();
    const onCreate = vi.fn();
    render(<CreateProjectModal onCancel={onCancel} onCreate={onCreate} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Acme Robotics"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create & set up" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Acme", undefined));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("stays open when an async caller explicitly asks for a retry", async () => {
    const onCancel = vi.fn();
    render(
      <CreateProjectModal
        onCancel={onCancel}
        onCreate={vi.fn(async () => ({ ok: false }))}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Acme Robotics"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create & set up" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create & set up" })).toBeEnabled();
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("closes on Escape and returns focus to the invoking control", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "New project";
    document.body.appendChild(trigger);
    trigger.focus();
    const onCancel = vi.fn();
    const { unmount } = render(<CreateProjectModal onCancel={onCancel} onCreate={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Name your project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("explains when creating a project requires an additional purchase", () => {
    render(
      <CreateProjectModal
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        packageCapacity={{
          billingSlug: "agency",
          kind: "agency",
          included: 3,
          purchased: 1,
          reserved: 4,
          used: 3,
          remaining: 0,
          allowance: 4,
          overLimit: false,
        }}
      />,
    );
    const capacity = screen.getByTestId("create-project-capacity");
    expect(capacity).toHaveTextContent("No projects remaining in your package");
    expect(capacity).toHaveTextContent("Creating this project requires an additional project purchase.");
    expect(capacity).not.toHaveTextContent("included");
    expect(capacity).not.toHaveTextContent("reserved");
    expect(capacity).toHaveTextContent("Each managed client can have one project");
  });

  it("reassures users when a project remains in their package", () => {
    render(
      <CreateProjectModal
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        packageCapacity={{
          billingSlug: "client",
          kind: "client",
          included: 1,
          purchased: 0,
          reserved: 0,
          used: 0,
          remaining: 1,
          allowance: 1,
          overLimit: false,
        }}
      />,
    );
    const capacity = screen.getByTestId("create-project-capacity");
    expect(capacity).toHaveTextContent("1 project remaining in your package");
    expect(capacity).toHaveTextContent("Creating this project won’t incur an additional charge.");
  });
});