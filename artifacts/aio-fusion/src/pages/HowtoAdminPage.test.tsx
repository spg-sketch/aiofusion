// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const del = vi.fn();
vi.mock("@workspace/api-client-react", () => ({
  useListAdminHowto: () => list(),
  getListAdminHowtoQueryKey: () => ["/api/admin/howto"],
  useCreateAdminHowto: () => ({ mutateAsync: create }),
  useUpdateAdminHowto: () => ({ mutateAsync: update }),
  useDeleteAdminHowto: () => ({ mutateAsync: del }),
  useListAdminInsightMedia: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
  getListAdminInsightMediaQueryKey: () => ["media"],
}));
import { HowtoAdminPage } from "./HowtoAdminPage";

const entry = (id: string, type: string, status: string) => ({ id, title: `Title ${id}`, description: "desc", type, readTime: "2 min", displayOrder: 1, status, createdAt: "", updatedAt: "", publishedAt: null, body: [{ type: "paragraph", runs: [{ text: "Hello" }] }] });

function setup() {
  const register = vi.fn();
  const utils = render(
    <QueryClientProvider client={new QueryClient()}>
      <HowtoAdminPage onBack={() => {}} onRegisterUnsavedEditor={register} />
    </QueryClientProvider>,
  );
  return { register, ...utils };
}
const lastReg = (r: ReturnType<typeof vi.fn>) => r.mock.calls.filter((c) => c[0]).at(-1)?.[0];

describe("HowtoAdminPage", () => {
  it("defaults George availability on and saves an opt-out through the normal editor workflow", async () => {
    const { register } = setup();
    fireEvent.click(screen.getByTestId("row-entry-one"));
    expect(screen.getByTestId("input-include-george")).toBeChecked();
    fireEvent.click(screen.getByTestId("input-include-george"));
    expect(screen.getByTestId("input-include-george")).not.toBeChecked();
    await waitFor(() => expect(lastReg(register).dirty).toBe(true));
    update.mockResolvedValueOnce({ ...entry("one", "Guide", "draft"), includeInGeorge: false });
    fireEvent.click(screen.getByTestId("button-save"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: "one", data: expect.objectContaining({ includeInGeorge: false }) }));
    await waitFor(() => expect(lastReg(register).dirty).toBe(false));
    // Simulate the refreshed server list; this suite mocks the query hook.
    list.mockReturnValue({ data: [
      { ...entry("one", "Guide", "draft"), includeInGeorge: false },
      entry("two", "Video", "published"),
    ], isLoading: false, isError: false, error: null, refetch: vi.fn() });
    fireEvent.click(screen.getByTestId("row-entry-two"));
    fireEvent.click(screen.getByTestId("row-entry-one"));
    expect(screen.getByTestId("input-include-george")).not.toBeChecked();
    fireEvent.click(screen.getByTestId("button-new-entry"));
    expect(screen.getByTestId("input-include-george")).toBeChecked();
  });
  beforeEach(() => {
    [list, create, update, del].forEach((m) => m.mockReset());
    list.mockReturnValue({ data: [entry("one", "Guide", "draft"), entry("two", "Video", "published")], isLoading: false, isError: false, error: null, refetch: vi.fn() });
  });
  afterEach(cleanup);

  it("searches and filters by type and status", () => {
    setup();
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "two" } });
    expect(screen.queryByTestId("row-entry-one")).toBeNull();
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("filter-status-published"));
    expect(screen.queryByTestId("row-entry-one")).toBeNull();
    fireEvent.click(screen.getByTestId("filter-status-All"));
    fireEvent.click(screen.getByTestId("filter-type-Guide"));
    expect(screen.queryByTestId("row-entry-two")).toBeNull();
  });

  it("keeps inputs and unsaved state when a save fails, clears only on confirmed success", async () => {
    const { register } = setup();
    fireEvent.click(screen.getByTestId("button-new-entry"));
    fireEvent.change(screen.getByTestId("input-title"), { target: { value: "My New Guide" } });
    expect((screen.getByTestId("input-id") as HTMLInputElement).value).toBe("my-new-guide");
    fireEvent.change(screen.getByTestId("input-description"), { target: { value: "About it" } });
    await waitFor(() => expect(lastReg(register).dirty).toBe(true));

    create.mockRejectedValueOnce({ data: { error: "body.0 is invalid" } });
    fireEvent.click(screen.getByTestId("button-save"));
    await waitFor(() => expect(screen.getByTestId("save-error").textContent).toContain("body.0 is invalid"));
    expect((screen.getByTestId("input-title") as HTMLInputElement).value).toBe("My New Guide");
    expect(lastReg(register).dirty).toBe(true);

    create.mockResolvedValueOnce({ ...entry("my-new-guide", "Guide", "draft") });
    fireEvent.click(screen.getByTestId("button-retry-save"));
    await waitFor(() => expect(lastReg(register).dirty).toBe(false));
    expect(create.mock.calls[1][0].data).toMatchObject({ id: "my-new-guide", status: "draft", type: "Guide", displayOrder: 0 });
    expect((screen.getByTestId("input-id") as HTMLInputElement).disabled).toBe(true);
  });

  it("publishes, unpublishes and requires confirmation to delete", async () => {
    setup();
    fireEvent.click(screen.getByTestId("row-entry-one"));
    update.mockResolvedValueOnce(entry("one", "Guide", "published"));
    fireEvent.click(screen.getByTestId("button-publish"));
    await waitFor(() => expect(screen.getByTestId("button-unpublish")).toBeTruthy());
    expect(update.mock.calls[0][0]).toMatchObject({ id: "one", data: { status: "published" } });
    expect(update.mock.calls[0][0].data.id).toBeUndefined();

    update.mockResolvedValueOnce(entry("one", "Guide", "draft"));
    fireEvent.click(screen.getByTestId("button-unpublish"));
    await waitFor(() => expect(screen.getByTestId("button-publish")).toBeTruthy());

    fireEvent.click(screen.getByTestId("button-delete"));
    expect(del).not.toHaveBeenCalled();
    del.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByTestId("button-confirm-delete"));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ id: "one" }));
    await waitFor(() => expect(screen.getByTestId("editor-empty")).toBeTruthy());
  });
  it("anchors the permanent id after deferred creation while retaining pending title edits", async () => {
    const { register } = setup();
    fireEvent.click(screen.getByTestId("button-new-entry"));
    fireEvent.change(screen.getByTestId("input-title"), { target: { value: "Original guide" } });
    fireEvent.change(screen.getByTestId("input-description"), { target: { value: "Description" } });
    let confirmCreate!: (value: ReturnType<typeof entry>) => void;
    create.mockImplementationOnce(() => new Promise((resolve) => { confirmCreate = resolve; }));
    fireEvent.click(screen.getByTestId("button-save"));
    await waitFor(() => expect(lastReg(register).busy).toBe(true));
    expect((screen.getByTestId("input-id") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-title"), { target: { value: "Title edited while saving" } });
    expect((screen.getByTestId("input-id") as HTMLInputElement).value).toBe("original-guide");
    confirmCreate(entry("original-guide", "Guide", "draft"));
    await waitFor(() => expect(lastReg(register).busy).toBe(false));
    expect(lastReg(register).dirty).toBe(true);
    expect((screen.getByTestId("input-title") as HTMLInputElement).value).toBe("Title edited while saving");
    update.mockImplementation(({ id, data }) => Promise.resolve({ ...entry(id, "Guide", "draft"), ...data, id }));
    fireEvent.click(screen.getByTestId("button-save"));
    await waitFor(() => expect(lastReg(register).dirty).toBe(false));
    fireEvent.change(screen.getByTestId("input-title"), { target: { value: "Another saved edit" } });
    fireEvent.click(screen.getByTestId("button-save"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(lastReg(register).busy).toBe(false));
    expect(update.mock.calls.map(([input]) => input.id)).toEqual(["original-guide", "original-guide"]);
    expect(update.mock.calls[0][0].data.title).toBe("Title edited while saving");
    del.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByTestId("button-delete"));
    fireEvent.click(screen.getByTestId("button-confirm-delete"));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ id: "original-guide" }));
    await waitFor(() => expect(screen.getByTestId("editor-empty")).toBeTruthy());
  });

  it("guards switching entries when dirty and warns before unload", async () => {
    setup();
    fireEvent.click(screen.getByTestId("row-entry-one"));
    fireEvent.change(screen.getByTestId("input-title"), { target: { value: "Changed" } });
    const ev = new Event("beforeunload", { cancelable: true });
    await waitFor(() => { window.dispatchEvent(ev); expect(ev.defaultPrevented).toBe(true); });
    fireEvent.click(screen.getByTestId("row-entry-two"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay on this page" }));
    expect((screen.getByTestId("input-title") as HTMLInputElement).value).toBe("Changed");
    fireEvent.click(screen.getByTestId("row-entry-two"));
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect((screen.getByTestId("input-title") as HTMLInputElement).value).toBe("Title two"));
  });
});
