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
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(screen.queryByText(/No media found/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading images" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});