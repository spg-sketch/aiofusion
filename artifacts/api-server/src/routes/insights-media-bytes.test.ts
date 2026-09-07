import { describe, expect, it } from "vitest";
import { detectRasterBytes } from "./insights";

describe("CMS image byte validation", () => {
  it("accepts PNG, JPEG and WEBP signatures", () => {
    expect(detectRasterBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectRasterBytes(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(detectRasterBytes(Buffer.from("RIFF0000WEBP"))).toBe("image/webp");
  });

  it("rejects files whose bytes are not a supported image", () => {
    expect(detectRasterBytes(Buffer.from("not an image"))).toBeNull();
  });
});