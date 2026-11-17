import type { EngineMode } from "../types/compression";

export interface ImageCompressOptions {
  targetBytes: number;
  onProgress?: (percent: number, stage: string) => void;
}

export interface ImageCompressResult {
  blob: Blob;
  outputSize: number;
  engineUsed: EngineMode;
  warnings: string[];
}

export async function compressImageLocally(
  file: File,
  options: ImageCompressOptions
): Promise<ImageCompressResult> {
  options.onProgress?.(15, "Decoding image locally...");
  const bitmap = await createImageBitmap(file);
  const warnings: string[] = [];

  try {
    const scales = [1, 0.85, 0.65, 0.45];
    let bestBlob: Blob | null = null;

    for (let sIdx = 0; sIdx < scales.length; sIdx++) {
      const scale = scales[sIdx];
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      // Binary search JPEG quality from 0.92 down to 0.35
      let low = 0.35;
      let high = 0.92;
      for (let step = 0; step < 5; step++) {
        const mid = Number(((low + high) / 2).toFixed(2));
        options.onProgress?.(
          25 + sIdx * 18 + step * 3,
          `Tuning visual quality (${Math.round(mid * 100)}%)...`
        );
        const candidate = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", mid)
        );
        if (!candidate) continue;
        if (!bestBlob || candidate.size < bestBlob.size) {
          bestBlob = candidate;
        }
        if (candidate.size <= options.targetBytes) {
          bestBlob = candidate;
          low = mid;
        } else {
          high = mid;
        }
      }

      if (bestBlob && bestBlob.size <= options.targetBytes) {
        break;
      }
    }

    if (!bestBlob) {
      throw new Error("Could not encode compressed image");
    }

    if (bestBlob.size >= file.size && file.size <= options.targetBytes) {
      bestBlob = file;
    } else if (bestBlob.size > options.targetBytes) {
      warnings.push("Image reached minimum safe resolution without distortion.");
    }

    options.onProgress?.(100, "Done");
    return {
      blob: bestBlob,
      outputSize: bestBlob.size,
      engineUsed: "image-canvas",
      warnings,
    };
  } finally {
    bitmap.close();
  }
}
