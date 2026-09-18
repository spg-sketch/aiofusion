// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

describe("UnsavedChangesDialog", () => {
  afterEach(cleanup);

  it("offers all three explicit actions and keeps save disabled while AI is running", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onStay = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        replacing
        busy
        saving={false}
        error=""
        onSave={onSave}
        onDiscard={onDiscard}
        onStay={onStay}
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent("Retrieving this item will replace");
    expect(screen.getByRole("button", { name: "Save and leave" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(onDiscard).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Stay on this page" }));
    expect(onStay).toHaveBeenCalled();
  });

  it("shows retryable save errors without removing the choices", () => {
    render(
      <UnsavedChangesDialog
        open
        busy={false}
        saving={false}
        error="The library save failed."
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onStay={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The library save failed.");
    expect(screen.getByRole("button", { name: "Save and leave" })).toBeEnabled();
  });
});