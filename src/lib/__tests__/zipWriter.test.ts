import { describe, expect, it } from "vitest";
import { buildZipArchive, crc32 } from "../zipWriter";

describe("zipWriter", () => {
  it("computes standard IEEE CRC32", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  it("writes valid PKZIP headers and deduplicates identical filenames", () => {
    const archive = buildZipArchive([
      { name: "clip.mp4", data: new Uint8Array([1, 2, 3, 4]) },
      { name: "clip.mp4", data: new Uint8Array([5, 6, 7]) },
    ]);

    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    // Local file header signature
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // End of central directory at tail (22 bytes)
    const eocdOffset = archive.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 8, true)).toBe(2);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(2);

    const ascii = new TextDecoder("utf-8", { fatal: false }).decode(archive);
    expect(ascii).toContain("clip.mp4");
    expect(ascii).toContain("clip-2.mp4");
  });
});
