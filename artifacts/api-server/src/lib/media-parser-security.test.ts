import { expect, it, vi } from "vitest";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { parseMediaImportXlsx } from "./media-csv-import";

vi.mock("node:zlib", async (original) => {
  const actual = await original<typeof import("node:zlib")>();
  return { ...actual, inflateRawSync: vi.fn(actual.inflateRawSync) };
});

it("characterises inflation before advertised-size validation, without a decompression bomb", async () => {
  const name = Buffer.from("xl/workbook.xml");
  const expanded = Buffer.from("Bounded synthetic fixture payload.");
  const compressed = deflateRawSync(expanded);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(1, 22); // Untrusted claimed size.
  local.writeUInt16LE(name.length, 26);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50, 0);
  directory.writeUInt16LE(8, 10);
  directory.writeUInt32LE(compressed.length, 20);
  directory.writeUInt32LE(1, 24);
  directory.writeUInt16LE(name.length, 28);
  const offset = local.length + name.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length + name.length, 12);
  end.writeUInt32LE(offset, 16);
  const fixture = Buffer.concat([local, name, compressed, directory, name, end]);
  await expect(parseMediaImportXlsx(fixture.toString("base64"))).rejects.toThrow("invalid XLSX entry size");
  expect(inflateRawSync).toHaveBeenCalledOnce();
  expect(vi.mocked(inflateRawSync).mock.calls[0]).toHaveLength(1);
  // No maxOutputLength was passed. No large allocation or load test attempted.
});