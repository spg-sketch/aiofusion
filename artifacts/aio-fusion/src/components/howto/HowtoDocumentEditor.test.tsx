// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HowtoDocumentEditor } from "./HowtoDocumentEditor";
import type { HowtoBlock } from "../../lib/howto";

vi.mock("../MediaLibraryModal", () => ({
  MediaLibraryModal: ({ onSelect, onClose }: {
    onSelect: (media: { id: string; publicUrl: string; altText: string }) => void;
    onClose: () => void;
  }) => <div role="dialog" aria-label="Media Library">
    <button onClick={() => onSelect({ id: "guide-image", publicUrl: "/api/storage/objects/guide-image", altText: "Settings screen" })}>Choose test image</button>
    <button onClick={onClose}>Close media library</button>
  </div>,
}));

afterEach(cleanup);
// jsdom has no layout engine. ProseMirror uses Range geometry when the
// formatting controls restore focus; the real-browser tests cover real layout.
const rangeGeometry = ["getClientRects", "getBoundingClientRect"].map((name) => ({
  name, descriptor: Object.getOwnPropertyDescriptor(Range.prototype, name),
}));
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterAll(() => {
  for (const { name, descriptor } of rangeGeometry) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});

function EditableGuide() {
  const [body, setBody] = useState<HowtoBlock[]>([{ type: "paragraph", runs: [{ text: "A pasted guide title" }] }]);
  return <HowtoDocumentEditor body={body} onChange={setBody} />;
}

describe("guide formatting controls", () => {
  it("shows a labelled Add image action and cancelling leaves the guide unchanged", async () => {
    const onChange = vi.fn();
    render(<HowtoDocumentEditor body={[{ type: "paragraph", runs: [{ text: "Keep these instructions" }] }]} onChange={onChange} />);
    const add = await screen.findByRole("button", { name: "Add image" });
    expect(add.textContent).toContain("Add image");
    fireEvent.click(add);
    expect(screen.getByRole("dialog", { name: "Media Library" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close media library" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Guide content" }).textContent).toContain("Keep these instructions");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("inserts a chosen library image into the same editor without removing text", async () => {
    render(<EditableGuide />);
    fireEvent.click(await screen.findByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose test image" }));
    const box = screen.getByRole("textbox", { name: "Guide content" });
    await waitFor(() => expect(box.querySelector("img")?.getAttribute("src")).toBe("/api/storage/objects/guide-image"));
    expect(box.textContent).toContain("A pasted guide title");
    expect(box.querySelector("figure")?.getAttribute("data-media-id")).toBe("guide-image");
    expect(box.querySelector("img")?.getAttribute("alt")).toBe("Settings screen");
    expect(screen.getAllByRole("textbox", { name: "Guide content" })).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches the same text from body to heading and back without separate section fields", async () => {
    render(<EditableGuide />);
    const box = await screen.findByRole("textbox", { name: "Guide content" });
    expect(screen.getAllByRole("textbox", { name: "Guide content" })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Text format"), { target: { value: "heading" } });
    await waitFor(() => expect(box.querySelector("h2")?.textContent).toBe("A pasted guide title"));
    fireEvent.change(screen.getByLabelText("Text format"), { target: { value: "paragraph" } });
    await waitFor(() => {
      expect(box.querySelector("h2")).toBeNull();
      expect(box.querySelector("p")?.textContent).toBe("A pasted guide title");
    });
  });
});