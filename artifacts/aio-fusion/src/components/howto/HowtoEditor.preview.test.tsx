// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HowtoEntry } from "../../lib/howto";
import { BodyView } from "./HowtoBlocks";

vi.mock("@workspace/api-client-react", () => ({
  useCreateAdminHowto: () => ({ mutateAsync: vi.fn() }),
  useUpdateAdminHowto: () => ({ mutateAsync: vi.fn() }),
  useDeleteAdminHowto: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("./HowtoDocumentEditor", () => ({ HowtoDocumentEditor: () => <div>Isolated editor</div> }));
import { HowtoEditor } from "./HowtoEditor";

afterEach(cleanup);

describe("How-to preview images", () => {
  it("uses the shared loading and unavailable states without changing the draft", () => {
    const entry: HowtoEntry = {
      id: "fixture", title: "Fixture guide", description: "Synthetic preview", type: "Guide",
      readTime: "2 min", displayOrder: 0, status: "draft", createdAt: "", updatedAt: "", publishedAt: null,
      body: [
        { type: "paragraph", runs: [{ text: "Before the images." }] },
        { type: "image", mediaId: "missing", altText: "Missing description", caption: "Missing caption" },
        { type: "image", mediaId: "slow", url: "/slow.png", altText: "Slow description", caption: "Slow caption" },
        { type: "image", mediaId: "failed", url: "/failed.png", altText: "Failed description", caption: "Failed caption" },
        { type: "paragraph", runs: [{ text: "After the images." }] },
      ],
    };
    const saved = JSON.stringify(entry);
    const onStateChange = vi.fn();
    render(<HowtoEditor entry={entry} onPersisted={vi.fn()} onDeleted={vi.fn()} onStateChange={onStateChange} controlRef={{ current: null }} />);
    fireEvent.click(screen.getByTestId("tab-preview"));
    const preview = within(screen.getByTestId("preview"));
    const [missing, slow, failed] = preview.getAllByTestId("block-image");
    expect(missing.querySelector("img")).toBeNull();
    expect(missing).toHaveTextContent("Image preview unavailable");
    expect(missing).toHaveTextContent("Missing description");
    expect(slow).toHaveTextContent("Loading image");
    expect(slow.querySelector("img")).toHaveClass("hidden");
    fireEvent.error(failed.querySelector("img")!);
    expect(failed.querySelector("img")).toBeNull();
    expect(failed).toHaveTextContent("Image preview unavailable");
    expect(failed).toHaveTextContent("Failed description");
    expect(preview.getByText("Before the images.")).toBeTruthy();
    expect(preview.getByText("After the images.")).toBeTruthy();
    [missing, slow, failed].forEach((figure, i) => {
      expect(figure.querySelector("figcaption")).toHaveTextContent(["Missing caption", "Slow caption", "Failed caption"][i]);
    });
    fireEvent.load(slow.querySelector("img")!);
    expect(preview.getByRole("img", { name: "Slow description" })).toBeTruthy();
    expect(slow).not.toHaveTextContent("Loading image");
    expect(onStateChange).toHaveBeenLastCalledWith({ dirty: false, busy: false });
    expect(JSON.stringify(entry)).toBe(saved);
  });

  it("resets failed and loaded state when the resolved URL or media reference changes", () => {
    const image = { type: "image" as const, mediaId: "original", url: "/original.png", altText: "Original description", caption: "Original caption" };
    const { rerender } = render(<BodyView body={[image]} />);
    fireEvent.error(screen.getByTestId("block-image").querySelector("img")!);
    expect(screen.getByText("Image preview unavailable")).toBeTruthy();
    rerender(<BodyView body={[{ ...image, url: "/replacement.png" }]} />);
    const replacement = screen.getByTestId("block-image").querySelector("img")!;
    expect(replacement).toHaveAttribute("src", "/replacement.png");
    expect(screen.getByText("Loading image…")).toBeTruthy();
    fireEvent.load(replacement);
    expect(screen.getByRole("img", { name: image.altText })).toBeTruthy();
    rerender(<BodyView body={[{ ...image, mediaId: "replacement", url: "/replacement.png" }]} />);
    expect(screen.getByText("Loading image…")).toBeTruthy();
    rerender(<BodyView body={[{ ...image, url: undefined }]} />);
    expect(screen.getByText("Image preview unavailable")).toBeTruthy();
    expect(screen.getByText(image.altText)).toBeTruthy();
    expect(screen.getByText(image.caption)).toBeTruthy();
  });
});