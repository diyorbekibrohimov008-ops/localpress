import { describe, expect, it } from "vitest";
import { buildPdfFromPages, compressPdfLocally } from "../pdfEngine";

function makeFakeJpeg(payloadSize: number, width = 1600, height = 1200): Uint8Array {
  // Minimal valid JPEG SOI + SOF0 header + filler + EOI so readJpegDimensions parses it
  const out = new Uint8Array(Math.max(32, payloadSize));
  out[0] = 0xff;
  out[1] = 0xd8; // SOI
  out[2] = 0xff;
  out[3] = 0xc0; // SOF0
  out[4] = 0x00;
  out[5] = 0x0b;
  out[6] = 8;
  out[7] = (height >> 8) & 0xff;
  out[8] = height & 0xff;
  out[9] = (width >> 8) & 0xff;
  out[10] = width & 0xff;
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9; // EOI
  return out;
}

function verifyPdfXrefOffsets(pdfBytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(pdfBytes);
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

  const startXrefMatch = text.match(/startxref\s+(\d+)\s+%%EOF/);
  expect(startXrefMatch).not.toBeNull();
  const xrefPos = Number(startXrefMatch![1]);
  expect(text.slice(xrefPos, xrefPos + 4)).toBe("xref");

  const entryMatches = [...text.slice(xrefPos).matchAll(/^(\d{10}) (\d{5}) n $/gm)];
  expect(entryMatches.length).toBeGreaterThan(0);
  for (const m of entryMatches) {
    const offset = Number(m[1]);
    const slice = text.slice(offset, offset + 24);
    expect(slice).toMatch(/^\d+ \d+ obj\b/);
  }
}

describe("pdfEngine", () => {
  it("builds spec-compliant PDFs and shrinks embedded images while keeping selectable text", async () => {
    const bigPdfBytes = buildPdfFromPages([
      {
        jpegBytes: makeFakeJpeg(1_600_000, 2400, 1800),
        width: 2400,
        height: 1800,
        overlayTextLines: ["CONFIDENTIAL COURT FILING", "Exhibit A — Verified"],
      },
      {
        jpegBytes: makeFakeJpeg(1_600_000, 2400, 1800),
        width: 2400,
        height: 1800,
        overlayTextLines: ["Page 2 — Chain of Custody"],
      },
    ]);

    verifyPdfXrefOffsets(bigPdfBytes);
    expect(bigPdfBytes.length).toBeGreaterThan(3_000_000);

    const file = new File([bigPdfBytes.buffer as ArrayBuffer], "court-exhibit.pdf", {
      type: "application/pdf",
    });

    const result = await compressPdfLocally(file, {
      targetBytes: 1.9 * 1024 * 1024,
      allowRasterFallback: false,
      recompressJpeg: async (jpegBytes, quality) => {
        const shrinkFactor = Math.max(0.18, quality * 0.45);
        return makeFakeJpeg(Math.floor(jpegBytes.length * shrinkFactor), 1200, 900);
      },
    });

    const outBytes = new Uint8Array(await result.blob.arrayBuffer());
    verifyPdfXrefOffsets(outBytes);

    expect(result.outputSize).toBeLessThan(1.9 * 1024 * 1024);
    expect(result.textPreserved).toBe(true);
    expect(result.imagesRecompressed).toBe(2);

    const outText = new TextDecoder("latin1").decode(outBytes);
    expect(outText).toContain("CONFIDENTIAL COURT FILING");
  });
});
