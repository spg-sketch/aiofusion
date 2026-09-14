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
});