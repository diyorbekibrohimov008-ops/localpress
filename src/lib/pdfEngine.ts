import type { EngineMode } from "../types/compression";

export interface PdfCompressOptions {
  targetBytes: number;
  onProgress?: (percent: number, stage: string) => void;
  /** Allows injecting a custom JPEG recompressor in tests or headless environments */
  recompressJpeg?: (
    jpegBytes: Uint8Array,
    quality: number,
    maxDimension: number
  ) => Promise<Uint8Array | null>;
  /** Allows disabling CDN pdfjs fallback in offline tests */
  allowRasterFallback?: boolean;
}

export interface PdfCompressResult {
  blob: Blob;
  outputSize: number;
  engineUsed: EngineMode;
  textPreserved: boolean;
  imagesRecompressed: number;
  streamsCompressed: number;
  warnings: string[];
}

export interface PdfPageImage {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
}

interface ParsedPdfObject {
  objNum: number;
  genNum: number;
  dictBytes: Uint8Array;
  dictText: string;
  streamBytes: Uint8Array | null;
  hasStream: boolean;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("latin1");

function indexOfAscii(
  haystack: Uint8Array,
  needle: string,
  fromIndex = 0
): number {
  const nLen = needle.length;
  if (nLen === 0) return fromIndex;
  const first = needle.charCodeAt(0);
  const limit = haystack.length - nLen;
  outer: for (let i = fromIndex; i <= limit; i++) {
    if (haystack[i] !== first) continue;
    for (let j = 1; j < nLen; j++) {
      if (haystack[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function deflateBytes(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate");
    const writer = cs.writable.getWriter();
    const copy = new Uint8Array(input.length);
    copy.set(input);
    await writer.write(copy);
    await writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function defaultRecompressJpeg(
  jpegBytes: Uint8Array,
  quality: number,
  maxDimension: number
): Promise<Uint8Array | null> {
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    return null;
  }
  const safeCopy = new Uint8Array(jpegBytes.length);
  safeCopy.set(jpegBytes);
  const blob = new Blob([safeCopy.buffer], { type: "image/jpeg" });
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height, 1)
    );
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const outBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!outBlob) return null;
    return new Uint8Array(await outBlob.arrayBuffer());
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

function parseClassicPdfObjects(pdfBytes: Uint8Array): {
  objects: ParsedPdfObject[];
  rootRef: string;
  infoRef: string | null;
} | null {
  const fullText = textDecoder.decode(pdfBytes);
  if (!fullText.startsWith("%PDF-")) return null;
  // Compressed XRef / Object streams require full PDF VM unpacking; skip classic rewrite if present
  if (/\/Type\s*\/XRef\b/.test(fullText) || /\/Type\s*\/ObjStm\b/.test(fullText)) {
    return null;
  }

  const trailerMatch = fullText.match(/trailer\s*<<([\s\S]*?)>>/);
  const rootMatch = trailerMatch?.[1].match(/\/Root\s+(\d+\s+\d+\s+R)/);
  const infoMatch = trailerMatch?.[1].match(/\/Info\s+(\d+\s+\d+\s+R)/);
  const rootRef = rootMatch ? rootMatch[1] : null;
  if (!rootRef) return null;

  const objects: ParsedPdfObject[] = [];
  const objHeaderRe = /(?:^|[\r\n])\s*(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objHeaderRe.exec(fullText)) !== null) {
    const objNum = Number(match[1]);
    const genNum = Number(match[2]);
    const bodyStart = match.index + match[0].length;

    const nextStreamIdx = indexOfAscii(pdfBytes, "stream", bodyStart);
    const nextEndObjIdx = indexOfAscii(pdfBytes, "endobj", bodyStart);
    if (nextEndObjIdx === -1) return null;

    if (nextStreamIdx !== -1 && nextStreamIdx < nextEndObjIdx) {
      const headerSlice = textDecoder.decode(pdfBytes.subarray(bodyStart, nextStreamIdx));
      // Confirm "stream" isn't just part of a word like "ObjStm" or inside a comment
      if (/\bstream\s*$/.test(headerSlice + "stream")) {
        let dataStart = nextStreamIdx + 6; // after "stream"
        if (pdfBytes[dataStart] === 13 && pdfBytes[dataStart + 1] === 10) {
          dataStart += 2;
        } else if (pdfBytes[dataStart] === 10 || pdfBytes[dataStart] === 13) {
          dataStart += 1;
        }

        const lenMatch = headerSlice.match(/\/Length\s+(\d+)\b/);
        let streamEnd = -1;
        let afterStream = -1;

        if (lenMatch) {
          const declaredLen = Number(lenMatch[1]);
          const candidateEnd = dataStart + declaredLen;
          const endStreamPos = indexOfAscii(pdfBytes, "endstream", candidateEnd);
          if (endStreamPos !== -1 && endStreamPos - candidateEnd <= 4) {
            streamEnd = candidateEnd;
            afterStream = indexOfAscii(pdfBytes, "endobj", endStreamPos);
          }
        }

        if (streamEnd === -1) {
          const endStreamPos = indexOfAscii(pdfBytes, "endstream", dataStart);
          if (endStreamPos === -1) return null;
          streamEnd = endStreamPos;
          if (pdfBytes[streamEnd - 1] === 10 && pdfBytes[streamEnd - 2] === 13) {
            streamEnd -= 2;
          } else if (pdfBytes[streamEnd - 1] === 10 || pdfBytes[streamEnd - 1] === 13) {
            streamEnd -= 1;
          }
          afterStream = indexOfAscii(pdfBytes, "endobj", endStreamPos);
        }

        if (afterStream === -1) return null;

        const dictBytes = pdfBytes.subarray(bodyStart, nextStreamIdx);
        const streamBytes = pdfBytes.subarray(dataStart, streamEnd);
        objects.push({
          objNum,
          genNum,
          dictBytes,
          dictText: headerSlice,
          streamBytes,
          hasStream: true,
        });
        objHeaderRe.lastIndex = afterStream + 6;
        continue;
      }
    }

    const dictBytes = pdfBytes.subarray(bodyStart, nextEndObjIdx);
    objects.push({
      objNum,
      genNum,
      dictBytes,
      dictText: textDecoder.decode(dictBytes),
      streamBytes: null,
      hasStream: false,
    });
    objHeaderRe.lastIndex = nextEndObjIdx + 6;
  }

  return objects.length > 0
    ? { objects, rootRef, infoRef: infoMatch ? infoMatch[1] : null }
    : null;
}

function updateDictLengthAndFilter(
  dictText: string,
  newLength: number,
  addFlateFilter = false
): string {
  let updated = dictText.trim();
  if (/\/Length\s+\d+/.test(updated)) {
    updated = updated.replace(/\/Length\s+\d+/, `/Length ${newLength}`);
  } else {
    updated = updated.replace(/>>\s*$/, ` /Length ${newLength}>>`);
  }

  if (addFlateFilter && !/\/Filter\b/.test(updated)) {
    updated = updated.replace(/>>\s*$/, ` /Filter /FlateDecode>>`);
  }
  return updated;
}

function serializePdfObjects(
  objects: ParsedPdfObject[],
  rootRef: string,
  infoRef: string | null
): Uint8Array {
  const sorted = [...objects].sort((a, b) => a.objNum - b.objNum);
  const maxObjNum = sorted.reduce((m, o) => Math.max(m, o.objNum), 0);

  const chunks: Uint8Array[] = [];
  const header = textEncoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  chunks.push(header);
  let offset = header.length;

  const offsets = new Map<number, { offset: number; gen: number }>();

  for (const obj of sorted) {
    offsets.set(obj.objNum, { offset, gen: obj.genNum });
    const prefix = textEncoder.encode(`${obj.objNum} ${obj.genNum} obj\n`);
    chunks.push(prefix);
    offset += prefix.length;

    if (obj.hasStream && obj.streamBytes !== null) {
      const dictBytes = textEncoder.encode(`${obj.dictText.trim()}\nstream\n`);
      const suffix = textEncoder.encode("\nendstream\nendobj\n");
      chunks.push(dictBytes, obj.streamBytes, suffix);
      offset += dictBytes.length + obj.streamBytes.length + suffix.length;
    } else {
      const bodyBytes = obj.dictBytes;
      const trimmed = obj.dictText.trim();
      const body = textEncoder.encode(`${trimmed}\nendobj\n`);
      // Use trimmed ASCII if non-stream dict has no binary
      const chosen = trimmed.length > 0 ? body : concatBytes([bodyBytes, textEncoder.encode("\nendobj\n")]);
      chunks.push(chosen);
      offset += chosen.length;
    }
  }

  const xrefOffset = offset;
  const xrefLines: string[] = [`xref\n0 ${maxObjNum + 1}\n`];
  xrefLines.push("0000000000 65535 f \n");
  for (let i = 1; i <= maxObjNum; i++) {
    const entry = offsets.get(i);
    if (entry) {
      xrefLines.push(
        `${String(entry.offset).padStart(10, "0")} ${String(entry.gen).padStart(5, "0")} n \n`
      );
    } else {
      xrefLines.push("0000000000 65535 f \n");
    }
  }

  const infoPart = infoRef && offsets.has(Number(infoRef.split(/\s+/)[0]))
    ? ` /Info ${infoRef}`
    : "";

  const trailer =
    `trailer\n<< /Size ${maxObjNum + 1} /Root ${rootRef}${infoPart} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(textEncoder.encode(xrefLines.join("") + trailer));
  return concatBytes(chunks);
}

/**
 * Builds a clean, spec-compliant PDF 1.4 document from compressed JPEG page images
 * and optional hidden/selectable text overlay.
 */
export function buildPdfFromPages(
  pages: Array<PdfPageImage & { overlayTextLines?: string[] }>
): Uint8Array {
  const objects: ParsedPdfObject[] = [];
  let nextId = 1;

  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;
  const pageIds: number[] = [];

  for (const page of pages) {
    const pageId = nextId++;
    const imageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);

    // Standard PDF points (72 dpi). Scale large images to standard US Letter max width ~612pt
    const ptScale = page.width > 700 ? 612 / page.width : 1;
    const ptW = Math.round(page.width * ptScale);
    const ptH = Math.round(page.height * ptScale);

    const imageDict =
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height}` +
      ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>`;

    objects.push({
      objNum: imageId,
      genNum: 0,
      dictBytes: textEncoder.encode(imageDict),
      dictText: imageDict,
      streamBytes: page.jpegBytes,
      hasStream: true,
    });

    const textOps: string[] = [];
    if (page.overlayTextLines && page.overlayTextLines.length > 0) {
      textOps.push("BT /F1 11 Tf 48 " + (ptH - 56) + " Td 15 TL");
      for (const line of page.overlayTextLines) {
        const escaped = line
          .replace(/\\/g, "\\\\")
          .replace(/\(/g, "\\(")
          .replace(/\)/g, "\\)");
        textOps.push(`(${escaped}) Tj T*`);
      }
      textOps.push("ET");
    }

    const contentStreamStr =
      `q ${ptW} 0 0 ${ptH} 0 0 cm /Im0 Do Q\n` + textOps.join("\n");
    const contentBytes = textEncoder.encode(contentStreamStr);

    objects.push({
      objNum: contentId,
      genNum: 0,
      dictBytes: textEncoder.encode(`<< /Length ${contentBytes.length} >>`),
      dictText: `<< /Length ${contentBytes.length} >>`,
      streamBytes: contentBytes,
      hasStream: true,
    });

    const pageDict =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${ptW} ${ptH}]` +
      ` /Resources << /XObject << /Im0 ${imageId} 0 R >> /Font << /F1 ${fontId} 0 R >> >>` +
      ` /Contents ${contentId} 0 R >>`;

    objects.push({
      objNum: pageId,
      genNum: 0,
      dictBytes: textEncoder.encode(pageDict),
      dictText: pageDict,
      streamBytes: null,
      hasStream: false,
    });
  }

  objects.unshift(
    {
      objNum: catalogId,
      genNum: 0,
      dictBytes: textEncoder.encode(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`),
      dictText: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
      streamBytes: null,
      hasStream: false,
    },
    {
      objNum: pagesId,
      genNum: 0,
      dictBytes: textEncoder.encode(
        `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
      ),
      dictText: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
      streamBytes: null,
      hasStream: false,
    },
    {
      objNum: fontId,
      genNum: 0,
      dictBytes: textEncoder.encode(
        `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
      ),
      dictText: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
      streamBytes: null,
      hasStream: false,
    }
  );

  return serializePdfObjects(objects, `${catalogId} 0 R`, null);
}

async function compressPdfStructural(
  pdfBytes: Uint8Array,
  options: PdfCompressOptions
): Promise<{
  bytes: Uint8Array;
  imagesRecompressed: number;
  streamsCompressed: number;
} | null> {
  const parsed = parseClassicPdfObjects(pdfBytes);
  if (!parsed) return null;

  const recompressJpeg = options.recompressJpeg ?? defaultRecompressJpeg;
  const passes = [
    { quality: 0.72, maxDim: 1600 },
    { quality: 0.52, maxDim: 1200 },
    { quality: 0.36, maxDim: 920 },
  ];

  let bestBytes = pdfBytes;
  let bestImages = 0;
  let bestStreams = 0;

  for (let pIdx = 0; pIdx < passes.length; pIdx++) {
    const pass = passes[pIdx];
    options.onProgress?.(
      20 + pIdx * 22,
      `Optimizing PDF objects & embedded scans (pass ${pIdx + 1})...`
    );

    let imagesRecompressed = 0;
    let streamsCompressed = 0;
    const clonedObjects: ParsedPdfObject[] = [];

    for (const obj of parsed.objects) {
      if (!obj.hasStream || !obj.streamBytes) {
        clonedObjects.push({ ...obj });
        continue;
      }

      const isImage =
        /\/Subtype\s*\/Image\b/.test(obj.dictText) &&
        /\/Filter\s*(?:\[\s*)?\/DCTDecode\b/.test(obj.dictText);

      if (isImage) {
        const shrunkJpeg = await recompressJpeg(
          obj.streamBytes,
          pass.quality,
          pass.maxDim
        );
        if (shrunkJpeg && shrunkJpeg.length < obj.streamBytes.length) {
          imagesRecompressed++;
          let nextDict = updateDictLengthAndFilter(
            obj.dictText,
            shrunkJpeg.length,
            false
          );
          // Read JPEG SOF dimensions if resized so PDF displays at exact aspect ratio
          const dims = readJpegDimensions(shrunkJpeg);
          if (dims) {
            nextDict = nextDict
              .replace(/\/Width\s+\d+/, `/Width ${dims.width}`)
              .replace(/\/Height\s+\d+/, `/Height ${dims.height}`);
          }
          clonedObjects.push({
            ...obj,
            dictText: nextDict,
            streamBytes: shrunkJpeg,
          });
          continue;
        }
      }

      // Compress uncompressed content/metadata streams with native Deflate
      if (!/\/Filter\b/.test(obj.dictText) && obj.streamBytes.length > 256) {
        const deflated = await deflateBytes(obj.streamBytes);
        if (deflated && deflated.length < obj.streamBytes.length) {
          streamsCompressed++;
          clonedObjects.push({
            ...obj,
            dictText: updateDictLengthAndFilter(
              obj.dictText,
              deflated.length,
              true
            ),
            streamBytes: deflated,
          });
          continue;
        }
      }

      clonedObjects.push({ ...obj });
    }

    const candidate = serializePdfObjects(
      clonedObjects,
      parsed.rootRef,
      parsed.infoRef
    );

    if (candidate.length < bestBytes.length) {
      bestBytes = candidate;
      bestImages = imagesRecompressed;
      bestStreams = streamsCompressed;
    }

    if (bestBytes.length <= options.targetBytes) {
      break;
    }
  }

  return {
    bytes: bestBytes,
    imagesRecompressed: bestImages,
    streamsCompressed: bestStreams,
  };
}

export function readJpegDimensions(
  jpeg: Uint8Array
): { width: number; height: number } | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = jpeg[i + 1];
    // SOF0..SOF2 markers carry dimensions
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (jpeg[i + 5] << 8) | jpeg[i + 6];
      const width = (jpeg[i + 7] << 8) | jpeg[i + 8];
      return { width, height };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const segLen = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (segLen < 2) break;
    i += 2 + segLen;
  }
  return null;
}

async function compressPdfViaRasterFallback(
  pdfBytes: Uint8Array,
  options: PdfCompressOptions
): Promise<Uint8Array | null> {
  if (options.allowRasterFallback === false || typeof document === "undefined") {
    return null;
  }

  try {
    options.onProgress?.(68, "Loading local PDF page renderer for deep shrink...");
    const pdfjsUrl =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs";
    const pdfjsWorkerUrl =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs";

    const pdfjs = await Promise.race([
      import(/* @vite-ignore */ pdfjsUrl),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PDF renderer timeout")), 10000)
      ),
    ]);

    if (pdfjs.GlobalWorkerOptions) {
      const workerCode = `import "${pdfjsWorkerUrl}";`;
      pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
        new Blob([workerCode], { type: "text/javascript" })
      );
    }

    const doc = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
    const attempts = [
      { scale: 1.3, quality: 0.72 },
      { scale: 1.0, quality: 0.56 },
      { scale: 0.78, quality: 0.42 },
    ];

    let best: Uint8Array | null = null;

    for (const attempt of attempts) {
      const pages: PdfPageImage[] = [];
      for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
        options.onProgress?.(
          72 + Math.round((pageNo / doc.numPages) * 22),
          `Raster-optimizing page ${pageNo}/${doc.numPages} locally...`
        );
        const page = await doc.getPage(pageNo);
        const viewport = page.getViewport({ scale: attempt.scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", attempt.quality)
        );
        if (!blob) continue;

        pages.push({
          jpegBytes: new Uint8Array(await blob.arrayBuffer()),
          width: canvas.width,
          height: canvas.height,
        });
      }

      if (pages.length > 0) {
        const candidate = buildPdfFromPages(pages);
        if (!best || candidate.length < best.length) {
          best = candidate;
        }
        if (candidate.length <= options.targetBytes) {
          return candidate;
        }
      }
    }

    return best;
  } catch {
    return null;
  }
}

export async function compressPdfLocally(
  file: File,
  options: PdfCompressOptions
): Promise<PdfCompressResult> {
  options.onProgress?.(10, "Inspecting PDF structure locally...");
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const warnings: string[] = [];

  const structural = await compressPdfStructural(originalBytes, options);
  if (structural && structural.bytes.length <= options.targetBytes) {
    options.onProgress?.(100, "Done — selectable text preserved");
    const copy = new Uint8Array(structural.bytes.length);
    copy.set(structural.bytes);
    return {
      blob: new Blob([copy.buffer], { type: "application/pdf" }),
      outputSize: structural.bytes.length,
      engineUsed: "pdf-structural",
      textPreserved: true,
      imagesRecompressed: structural.imagesRecompressed,
      streamsCompressed: structural.streamsCompressed,
      warnings,
    };
  }

  // Try deep raster compression if structural pass didn't shrink below strict target
  const rasterBytes = await compressPdfViaRasterFallback(originalBytes, options);
  if (
    rasterBytes &&
    (!structural || rasterBytes.length < structural.bytes.length) &&
    rasterBytes.length < originalBytes.length
  ) {
    warnings.push(
      "Converted pages to high-density compressed images to meet your strict MB target."
    );
    options.onProgress?.(100, "Done — optimized for strict upload limit");
    const copy = new Uint8Array(rasterBytes.length);
    copy.set(rasterBytes);
    return {
      blob: new Blob([copy.buffer], { type: "application/pdf" }),
      outputSize: rasterBytes.length,
      engineUsed: "pdf-raster",
      textPreserved: false,
      imagesRecompressed: structural?.imagesRecompressed ?? 0,
      streamsCompressed: structural?.streamsCompressed ?? 0,
      warnings,
    };
  }

  const bestBytes =
    structural && structural.bytes.length < originalBytes.length
      ? structural.bytes
      : originalBytes;

  if (bestBytes.length > options.targetBytes) {
    warnings.push(
      "PDF is already tightly compressed or uses compressed object streams that exceeded target offline."
    );
  }

  options.onProgress?.(100, "Finished local PDF optimization");
  const copy = new Uint8Array(bestBytes.length);
  copy.set(bestBytes);
  return {
    blob: new Blob([copy.buffer], { type: "application/pdf" }),
    outputSize: bestBytes.length,
    engineUsed: "pdf-structural",
    textPreserved: true,
    imagesRecompressed: structural?.imagesRecompressed ?? 0,
    streamsCompressed: structural?.streamsCompressed ?? 0,
    warnings,
  };
}
