// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListAdminInsightMedia } from "@workspace/api-client-react";
import { MediaLibraryModal } from "./MediaLibraryModal";

vi.mock("@workspace/api-client-react", () => ({
  useListAdminInsightMedia: vi.fn(),
  getListAdminInsightMediaQueryKey: () => ["/api/admin/insights/media"],
}));

const image = { id: "test-image", fileName: "settings.png", publicUrl: "/api/storage/objects/test-image", altText: "Settings" };
const refetch = vi.fn();
const fetchMock = vi.fn();
beforeEach(() => {
  vi.mocked(useListAdminInsightMedia).mockReturnValue({
    data: [image], isLoading: false, isError: false, refetch,
  } as unknown as ReturnType<typeof useListAdminInsightMedia>);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function open() {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<MediaLibraryModal onSelect={onSelect} onClose={onClose} />);
  return { onSelect, onClose, input: screen.getByLabelText("Upload image") };
}

describe("shared CMS image picker", () => {
  it("shows filenames and filters only filenames, ignoring case and surrounding spaces", () => {
    const otherImage = { ...image, id: "other-image", fileName: "Dashboard Overview.webp", altText: "settings" };
    vi.mocked(useListAdminInsightMedia).mockReturnValue({
      data: [image, otherImage], isLoading: false, isError: false, refetch,
    } as unknown as ReturnType<typeof useListAdminInsightMedia>);
    const { onSelect } = open();
    expect(screen.getByText(image.fileName)).toBeTruthy();
    expect(screen.getByText(otherImage.fileName)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by filename" }), { target: { value: "  SETTINGS.PNG  " } });
    expect(screen.queryByRole("button", { name: `Select image ${otherImage.fileName}` })).toBeNull();
    const result = screen.getByRole("button", { name: `Select image ${image.fileName}` });
    result.focus();
    expect(document.activeElement).toBe(result);
    expect(result.getAttribute("type")).toBe("button");
    fireEvent.click(result);
    expect(onSelect).toHaveBeenCalledWith(image);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: `Select image ${otherImage.fileName}` })).toBeTruthy();
  });

  it("distinguishes no matching filenames from an empty library and recovers when the query changes", () => {
    open();
    const search = screen.getByRole("searchbox", { name: "Search by filename" });
    fireEvent.change(search, { target: { value: "missing-file" } });
    expect(screen.getByRole("status").textContent).toContain('No images match "missing-file"');
    expect(screen.queryByText(/Upload an image to get started/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(search, { target: { value: ".png" } });
    expect(screen.getByRole("button", { name: "Select image settings.png" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    { data: [], isLoading: false, message: "No media found" },
    { data: undefined, isLoading: true, message: "Loading images..." },
  ])("keeps the $message state distinct from a search miss", ({ data, isLoading, message }) => {
    vi.mocked(useListAdminInsightMedia).mockReturnValue({
      data, isLoading, isError: false, refetch,
    } as unknown as ReturnType<typeof useListAdminInsightMedia>);
    open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByRole("status").textContent).toContain(message);
    expect(screen.queryByText(/No images match/)).toBeNull();
  });

  it("retains the focus trap and restores focus after filtering", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<MediaLibraryModal onClose={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "settings" } });
    const close = screen.getByRole("button", { name: "Close media library" });
    const imageButton = screen.getByRole("button", { name: "Select image settings.png" });
    imageButton.focus();
    fireEvent.keyDown(imageButton, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(imageButton);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("does not enable selection when opened as a library browser", () => {
    render(<MediaLibraryModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "settings" } });
    expect((screen.getByRole("button", { name: "Select image settings.png" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers an accessible dialog, upload input and keyboard-selectable existing images", () => {
    const { onSelect, onClose, input } = open();
    expect(screen.getByRole("dialog", { name: "Media Library" })).toBeTruthy();
    expect(input.getAttribute("accept")).toBe("image/png,image/jpeg,image/webp");
    fireEvent.click(screen.getByRole("button", { name: "Select image settings.png" }));
    expect(onSelect).toHaveBeenCalledWith(image);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    it(`uses the existing authenticated upload endpoint for ${type}`, async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => image });
      const { onSelect, input } = open();
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-matching-filename" } });
      fireEvent.change(input, { target: { files: [new File(["synthetic image"], "fixture", { type })] } });
      await waitFor(() => expect(onSelect).toHaveBeenCalledWith(image));
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toContain("/api/storage/uploads/direct");
      expect(request.credentials).toBe("include");
      expect(JSON.parse(request.body)).toMatchObject({ name: "fixture", contentType: type, size: 15 });
      expect(refetch).toHaveBeenCalledOnce();
    });
  }

  it("rejects unsupported and oversized files without uploading or changing content", async () => {
    const { onSelect, input } = open();
    fireEvent.change(input, { target: { files: [new File(["gif"], "fixture.gif", { type: "image/gif" })] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Choose a PNG, JPEG or WEBP"));
    const large = new File(["image"], "large.png", { type: "image/png" });
    Object.defineProperty(large, "size", { value: 6 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [large] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("6 MB or smaller"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps the picker open with an inline error and allows retry after a failed upload", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Upload was rejected" }) });
    const { onSelect, onClose, input } = open();
    const file = new File(["synthetic image"], "fixture.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Upload was rejected"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => image });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(image));
  });

  it("shows a library loading failure rather than a misleading empty list", () => {
    vi.mocked(useListAdminInsightMedia).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch,
    } as unknown as ReturnType<typeof useListAdminInsightMedia>);
    open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(screen.queryByText(/No media found/)).toBeNull();
    expect(screen.queryByText(/No images match/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading images" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});