// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HowtoDocumentEditor } from "./HowtoDocumentEditor";
import type { HowtoBlock } from "../../lib/howto";

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