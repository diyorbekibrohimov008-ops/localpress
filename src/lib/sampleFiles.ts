import { buildPdfFromPages } from "./pdfEngine";

/**
 * Creates a real ~3.0 MB multi-page legal PDF purely inside the browser
 * containing selectable text AND high-resolution exhibit scans so anyone
 * can immediately verify Court Portal (2 MB) compression without uploading files.
 */
export async function generateSampleLegalPdf(): Promise<File> {
  const pageSpecs = [
    {
      title: "IN THE SUPERIOR COURT — CONFIDENTIAL EXHIBIT A",
      subtitle: "Case No. 2026-CV-04819 | Motion Exhibit & Client Inspection Scan",
      accent: "#0f766e",
    },
    {
      title: "EXHIBIT B — SIGNED DECLARATION & CHAIN OF CUSTODY",
      subtitle: "Zero-Cloud Verification Sample | Selectable Legal Text Preserved",
      accent: "#1d4ed8",
    },
    {
      title: "EXHIBIT C — HIGH-DPI SITE PHOTOGRAPHY APPENDIX",
      subtitle: "Embedded 2200px raster scan compressed locally below 2.0 MB",
      accent: "#b45309",
    },
  ];

  const pages = [];

  for (let i = 0; i < pageSpecs.length; i++) {
    const spec = pageSpecs[i];
    const canvas = document.createElement("canvas");
    canvas.width = 2100;
    canvas.height = 2700;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    // Background paper texture with subtle deterministic grain to simulate high-DPI scan
    ctx.fillStyle = "#fcfbf7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Rich high-frequency photographic pattern inside exhibit area so JPEG size is ~1.0MB/page
    const imgData = ctx.createImageData(1700, 1200);
    const data = imgData.data;
    let seed = (i + 1) * 1337;
    for (let p = 0; p < data.length; p += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = (p / 4) % 1700;
      const y = Math.floor(p / 4 / 1700);
      const wave = Math.sin(x * 0.018 + i) * Math.cos(y * 0.015) * 42;
      const noise = ((seed >>> 24) & 0x3f) - 32;
      data[p] = Math.max(0, Math.min(255, 195 + wave + noise));
      data[p + 1] = Math.max(0, Math.min(255, 206 + wave * 0.7 + noise));
      data[p + 2] = Math.max(0, Math.min(255, 218 - wave * 0.5 + noise));
      data[p + 3] = 255;
    }
    ctx.putImageData(imgData, 200, 620);

    ctx.strokeStyle = spec.accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(120, 120, canvas.width - 240, canvas.height - 240);

    ctx.fillStyle = "#111827";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText(spec.title, 180, 270);

    ctx.fillStyle = "#4b5563";
    ctx.font = "34px sans-serif";
    ctx.fillText(spec.subtitle, 180, 345);

    ctx.fillStyle = spec.accent;
    ctx.fillRect(180, 390, 1740, 8);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText(`Scanned Evidence Plate #${i + 1} (2100x2700 High-DPI)`, 220, 560);

    ctx.fillStyle = "#334155";
    ctx.font = "30px sans-serif";
    ctx.fillText(
      "CONFIDENTIAL CLIENT RECORD — PROCESSED 100% LOCALLY VIA WEBASSEMBLY",
      180,
      2010
    );
    ctx.fillText(
      "Original high-DPI scans often exceed 2 MB court e-filing portal limits.",
      180,
      2075
    );

    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.96)
    );
    if (!jpegBlob) throw new Error("Could not render sample PDF page");

    pages.push({
      jpegBytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
      overlayTextLines: [
        spec.title,
        spec.subtitle,
        `Page ${i + 1} of ${pageSpecs.length} — Selectable PDF text layer preserved.`,
      ],
    });
  }

  const pdfBytes = buildPdfFromPages(pages);
  const copy = new Uint8Array(pdfBytes.length);
  copy.set(pdfBytes);
  return new File([copy.buffer], "Court-Exhibit-Confidential-Scan.pdf", {
    type: "application/pdf",
  });
}

/**
 * Generates a real ~3.6 MB animated screen-recording-style video clip in-browser
 * in ~3 seconds so evaluators can test video target-size compression immediately.
 */
export async function generateSampleTestVideo(
  onProgress?: (pct: number) => void
): Promise<File> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 10_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const durationMs = 3000;
  const start = performance.now();

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });

  recorder.start(200);

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      onProgress?.(Math.round(t * 100));

      // High-detail animated motion gradient + grid so encoder spends real bitrate
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, `hsl(${Math.round(180 + t * 80)}, 65%, 16%)`);
      grad.addColorStop(1, `hsl(${Math.round(230 - t * 60)}, 70%, 10%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
      ctx.lineWidth = 2;
      const shift = Math.round(t * 180);
      for (let x = -180 + (shift % 60); x < canvas.width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 90, canvas.height);
        ctx.stroke();
      }

      // Moving orb & live telemetry badge
      const orbX = 240 + Math.sin(t * Math.PI * 2) * 380 + 380;
      const orbY = 360 + Math.cos(t * Math.PI * 3) * 140;
      ctx.fillStyle = "#2dd4bf";
      ctx.beginPath();
      ctx.arc(orbX, orbY, 64, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 52px sans-serif";
      ctx.fillText("LOCALPRESS SAMPLE RECORDING", 110, 170);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "30px monospace";
      ctx.fillText(`1280x720 @ 30fps • Time ${(elapsed / 1000).toFixed(2)}s / 3.00s`, 110, 235);

      if (elapsed < durationMs) {
        requestAnimationFrame(tick);
      } else {
        recorder.stop();
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });

  const blob = await stopPromise;
  return new File([blob], "Screen-Recording-Demo-720p.webm", {
    type: "video/webm",
  });
}
