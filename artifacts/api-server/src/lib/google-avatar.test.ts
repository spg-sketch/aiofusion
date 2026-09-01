import { describe, expect, it, vi } from "vitest";
import { fetchGoogleAvatarDataUrl } from "./google-avatar";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);

describe("fetchGoogleAvatarDataUrl", () => {
  it("downloads a Google-hosted image and requests a small size", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      expect(String(input)).toContain("sz=256");
      return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
    });
    await expect(fetchGoogleAvatarDataUrl(
      "https://lh3.googleusercontent.com/a/example",
      fetchMock as typeof fetch,
    )).resolves.toBe(`data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects non-Google and non-HTTPS URLs without fetching", async () => {
    const fetchMock = vi.fn();
    await expect(fetchGoogleAvatarDataUrl(
      "https://example.com/avatar.jpg",
      fetchMock as typeof fetch,
    )).resolves.toBeNull();
    await expect(fetchGoogleAvatarDataUrl(
      "http://lh3.googleusercontent.com/a/example",
      fetchMock as typeof fetch,
    )).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects redirects, oversized responses and non-image bytes", async () => {
    await expect(fetchGoogleAvatarDataUrl(
      "https://lh3.googleusercontent.com/a/redirect",
      vi.fn(async () => new Response(null, { status: 302 })) as typeof fetch,
    )).resolves.toBeNull();
    await expect(fetchGoogleAvatarDataUrl(
      "https://lh3.googleusercontent.com/a/large",
      vi.fn(async () => new Response(jpeg, {
        status: 200,
        headers: { "content-length": "450001" },
      })) as typeof fetch,
    )).resolves.toBeNull();
    await expect(fetchGoogleAvatarDataUrl(
      "https://lh3.googleusercontent.com/a/not-image",
      vi.fn(async () => new Response("not an image", { status: 200 })) as typeof fetch,
    )).resolves.toBeNull();
  });
});