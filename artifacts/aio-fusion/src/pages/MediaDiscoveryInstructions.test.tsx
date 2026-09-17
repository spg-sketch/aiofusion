// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/contentAi", () => ({ apiBase: () => "" }));

import MediaDiscoveryInstructions from "./MediaDiscoveryInstructions";

const persistedText = "Use public sources and record the evidence for every discovery.";
const defaultText = "Find relevant journalists from public sources and explain the evidence.";

let getResponse: Response;
let putResponse: Response;
let requests: { url: string; init?: RequestInit }[];

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("MediaDiscoveryInstructions", () => {
  beforeEach(() => {
    getResponse = response({
      ok: true,
      instructions: persistedText,
      defaultInstructions: defaultText,
      version: 7,
      canEdit: true,
    });
    putResponse = response({ ok: true, instructions: persistedText, version: 8 });
    requests = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return init?.method === "PUT" ? putResponse.clone() : getResponse.clone();
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the persisted custom text and saves the new text with the exact version", async () => {
    render(<MediaDiscoveryInstructions />);
    const editor = await screen.findByTestId("input-instructions") as HTMLTextAreaElement;
    expect(editor.value).toBe(persistedText);

    const newText = "A new research policy with at least fifty characters for reviewers.";
    fireEvent.change(editor, { target: { value: newText } });
    fireEvent.click(screen.getByTestId("button-save-instructions"));

    await waitFor(() => expect(requests.filter(({ init }) => init?.method === "PUT")).toHaveLength(1));
    const put = requests.find(({ init }) => init?.method === "PUT");
    expect(put?.url).toBe("/api/store/media-db/discovery-instructions");
    expect(put?.init).toMatchObject({
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions: newText, version: 7 }),
    });
    expect(await screen.findByTestId("status-success")).toBeTruthy();
  });

  it("uses version zero when the persisted response omits a version", async () => {
    getResponse = response({
      ok: true,
      instructions: persistedText,
      defaultInstructions: defaultText,
      canEdit: true,
    });
    render(<MediaDiscoveryInstructions />);
    const editor = await screen.findByTestId("input-instructions") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "A replacement instruction with enough detail for saving." } });
    fireEvent.click(screen.getByTestId("button-save-instructions"));

    await waitFor(() => expect(requests.filter(({ init }) => init?.method === "PUT")).toHaveLength(1));
    const put = requests.find(({ init }) => init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body))).toEqual({
      instructions: "A replacement instruction with enough detail for saving.",
      version: 0,
    });
  });

  it("does not expose save or defaults after a failed initial GET", async () => {
    getResponse = response({ error: "unavailable" }, 503);
    render(<MediaDiscoveryInstructions />);

    expect(await screen.findByTestId("status-error")).toHaveTextContent("503");
    expect(screen.queryByTestId("button-save-instructions")).toBeNull();
    expect(screen.queryByTestId("button-restore-default")).toBeNull();
    expect(requests.some(({ init }) => init?.method === "PUT")).toBe(false);
  });

  it("does not replace an existing draft or permit Save after a failed reload", async () => {
    putResponse = response({ error: "conflict" }, 409);
    render(<MediaDiscoveryInstructions />);
    const editor = await screen.findByTestId("input-instructions") as HTMLTextAreaElement;
    const draft = "An unsaved draft that should survive a transient reload failure.";
    fireEvent.change(editor, { target: { value: draft } });
    fireEvent.click(screen.getByTestId("button-save-instructions"));
    await screen.findByTestId("status-conflict");
    getResponse = response({ error: "temporarily unavailable" }, 503);
    fireEvent.click(screen.getByTestId("button-reload-latest"));

    await screen.findByTestId("status-error");
    expect(editor.value).toBe(draft);
    expect(screen.getByTestId("button-save-instructions")).toBeDisabled();
    expect(requests.filter(({ init }) => init?.method === "PUT")).toHaveLength(1);
  });

  it("enforces the minimum and maximum instruction lengths", async () => {
    render(<MediaDiscoveryInstructions />);
    const editor = await screen.findByTestId("input-instructions") as HTMLTextAreaElement;
    const save = screen.getByTestId("button-save-instructions");

    fireEvent.change(editor, { target: { value: "too short" } });
    expect(save).toBeDisabled();

    fireEvent.change(editor, { target: { value: "x".repeat(50) } });
    expect(save).toBeEnabled();

    fireEvent.change(editor, { target: { value: "x".repeat(12001) } });
    expect(save).toBeDisabled();
    expect(screen.getByText(/12001 \/ 12000 characters/)).toBeTruthy();
  });

  it("restores the default as a draft and only sends it after Save", async () => {
    render(<MediaDiscoveryInstructions />);
    const editor = await screen.findByTestId("input-instructions") as HTMLTextAreaElement;
    fireEvent.click(screen.getByTestId("button-restore-default"));

    expect(editor.value).toBe(defaultText);
    expect(requests.filter(({ init }) => init?.method === "PUT")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("button-save-instructions"));
    await waitFor(() => expect(requests.filter(({ init }) => init?.method === "PUT")).toHaveLength(1));
    const put = requests.find(({ init }) => init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body))).toEqual({ instructions: defaultText, version: 7 });
  });

  it("keeps the draft when the server reports a version conflict", async () => {
    putResponse = response({ error: "conflict" }, 409);
    render(<MediaDiscoveryInstructions />);
    const editor = await screen.findByTestId("input-instructions") as HTMLTextAreaElement;
    const draft = "A deliberate draft that must remain visible after a conflict response.";
    fireEvent.change(editor, { target: { value: draft } });
    fireEvent.click(screen.getByTestId("button-save-instructions"));

    await screen.findByTestId("status-conflict");
    expect(editor.value).toBe(draft);
    expect(requests.filter(({ init }) => !init?.method)).toHaveLength(1);
  });

  it("keeps all mutation controls disabled for a read-only response", async () => {
    getResponse = response({
      ok: true,
      instructions: persistedText,
      defaultInstructions: defaultText,
      version: 4,
      canEdit: false,
    });
    render(<MediaDiscoveryInstructions />);

    const editor = await screen.findByTestId("input-instructions") as HTMLTextAreaElement;
    expect(editor).toBeDisabled();
    expect(screen.queryByTestId("button-save-instructions")).toBeNull();
    expect(screen.queryByTestId("button-restore-default")).toBeNull();
    expect(requests.some(({ init }) => init?.method === "PUT")).toBe(false);
  });
});