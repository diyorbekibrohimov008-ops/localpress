import type { EngineMode, VideoCompressionPlan } from "../types/compression";
import { planVideoCompression } from "./bitratePlanner";

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
}

export interface VideoCompressOptions {
  targetBytes: number;
  muteAudio?: boolean;
  onProgress?: (percent: number, stage: string) => void;
  onPlanReady?: (plan: VideoCompressionPlan, meta: VideoMetadata) => void;
}

export interface VideoCompressResult {
  blob: Blob;
  outputSize: number;
  engineUsed: EngineMode;
  plan: VideoCompressionPlan;
  metadata: VideoMetadata;
  warnings: string[];
}

interface FFmpegLike {
  on(event: "progress", cb: (evt: { progress: number }) => void): void;
  load(config: Record<string, string>): Promise<boolean>;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  exec(args: string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<boolean>;
}

const FFMPEG_ESM =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
const FFMPEG_WORKER_ESM =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js";
const FFMPEG_UTIL_ESM =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";
const CORE_MT_BASE =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm";
const CORE_ST_BASE =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";

let cachedFfmpeg: { instance: FFmpegLike; mode: "ffmpeg-mt" | "ffmpeg-st" } | null =
  null;

export function isMultiThreadedWasmSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.crossOriginIsolated) &&
    typeof SharedArrayBuffer !== "undefined"
  );
}

export async function probeVideoMetadata(file: File): Promise<VideoMetadata> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return { durationSeconds: 10, width: 1280, height: 720 };
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  try {
    return await new Promise<VideoMetadata>((resolve) => {
      const timer = setTimeout(() => {
        resolve({ durationSeconds: 15, width: 1280, height: 720 });
      }, 4500);

      video.onloadedmetadata = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          clearTimeout(timer);
          resolve({
            durationSeconds: video.duration,
            width: video.videoWidth || 1280,
            height: video.videoHeight || 720,
          });
          return;
        }
        // WebM files created without duration cues report Infinity until seeked
        video.ontimeupdate = () => {
          video.ontimeupdate = null;
          clearTimeout(timer);
          const dur =
            Number.isFinite(video.duration) && video.duration > 0
              ? video.duration
              : 10;
          resolve({
            durationSeconds: dur,
            width: video.videoWidth || 1280,
            height: video.videoHeight || 720,
          });
        };
        video.currentTime = 1e10;
      };

      video.onerror = () => {
        clearTimeout(timer);
        resolve({ durationSeconds: 15, width: 1280, height: 720 });
      };

      video.src = url;
    });
  } finally {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

async function loadFfmpegRuntime(
  onProgress?: (percent: number, stage: string) => void
): Promise<{ instance: FFmpegLike; mode: "ffmpeg-mt" | "ffmpeg-st" }> {
  if (cachedFfmpeg) return cachedFfmpeg;

  onProgress?.(6, "Loading local WebAssembly FFmpeg core (cached after first run)...");

  const withTimeout = <T,>(
    promise: Promise<T>,
    ms: number,
    label: string
  ): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out`)), ms)
      ),
    ]);

  const [{ FFmpeg }, { toBlobURL }] = await withTimeout(
    Promise.all([
      import(/* @vite-ignore */ FFMPEG_ESM),
      import(/* @vite-ignore */ FFMPEG_UTIL_ESM),
    ]),
    5000,
    "FFmpeg module load"
  );

  const ffmpeg: FFmpegLike = new FFmpeg();
  const useMultiThread = isMultiThreadedWasmSupported();
  const base = useMultiThread ? CORE_MT_BASE : CORE_ST_BASE;

  // Same-origin blob module worker avoids cross-origin Worker SecurityError under COEP
  const classWorkerURL = URL.createObjectURL(
    new Blob([`import "${FFMPEG_WORKER_ESM}";`], { type: "text/javascript" })
  );

  const loadConfig: Record<string, string> = {
    classWorkerURL,
    coreURL: await withTimeout(
      toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      12000,
      "FFmpeg core JS"
    ),
    wasmURL: await withTimeout(
      toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      20000,
      "FFmpeg Wasm"
    ),
  };

  if (useMultiThread) {
    loadConfig.workerURL = await withTimeout(
      toBlobURL(`${base}/ffmpeg-core.worker.js`, "text/javascript"),
      12000,
      "FFmpeg worker"
    );
  }

  await withTimeout(
    ffmpeg.load(loadConfig),
    15000,
    "FFmpeg Wasm initialization"
  );

  const mode: "ffmpeg-mt" | "ffmpeg-st" = useMultiThread
    ? "ffmpeg-mt"
    : "ffmpeg-st";
  cachedFfmpeg = { instance: ffmpeg, mode };
  return cachedFfmpeg;
}

async function compressWithFfmpegWasm(
  file: File,
  metadata: VideoMetadata,
  options: VideoCompressOptions
): Promise<VideoCompressResult> {
  const { instance: ffmpeg, mode } = await loadFfmpegRuntime(options.onProgress);
  const warnings: string[] = [];

  const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
  const inExt = extMatch ? extMatch[1].toLowerCase() : "mp4";
  const inputName = `input_${Date.now()}.${inExt}`;
  const outputName = `output_${Date.now()}.mp4`;

  let activePlan = planVideoCompression({
    durationSeconds: metadata.durationSeconds,
    originalBytes: file.size,
    targetBytes: options.targetBytes,
    width: metadata.width,
    height: metadata.height,
    muteAudio: options.muteAudio,
  });

  options.onPlanReady?.(activePlan, metadata);

  let passOffset = 18;
  let passSpan = 76;

  ffmpeg.on("progress", ({ progress }) => {
    const clamped = Math.max(0, Math.min(1, progress || 0));
    const pct = Math.min(96, Math.round(passOffset + clamped * passSpan));
    options.onProgress?.(
      pct,
      `Compressing locally in ${mode === "ffmpeg-mt" ? "multi-threaded" : "single-thread"} WebAssembly (${Math.round(clamped * 100)}%)...`
    );
  });

  options.onProgress?.(14, "Loading file into local Wasm memory...");
  const inputBytes = new Uint8Array(await file.arrayBuffer());
  await ffmpeg.writeFile(inputName, inputBytes);

  try {
    let exitCode = await ffmpeg.exec([
      "-i",
      inputName,
      ...activePlan.ffmpegVideoArgs,
      "-y",
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}`);
    }

    let rawOut = await ffmpeg.readFile(outputName);
    let outBytes =
      typeof rawOut === "string"
        ? new TextEncoder().encode(rawOut)
        : new Uint8Array(rawOut);

    // Automatic second-pass correction if container/CRF variance exceeded strict cap
    if (outBytes.byteLength > options.targetBytes && outBytes.byteLength > 250 * 1024) {
      options.onProgress?.(
        76,
        "Refining bitrate to fit strictly under destination cap..."
      );
      passOffset = 78;
      passSpan = 18;
      const ratio = options.targetBytes / outBytes.byteLength;
      const adjustedTarget = Math.max(
        180 * 1024,
        Math.floor(options.targetBytes * Math.min(0.86, ratio * 0.92))
      );
      activePlan = planVideoCompression({
        durationSeconds: metadata.durationSeconds,
        originalBytes: file.size,
        targetBytes: adjustedTarget,
        width: metadata.width,
        height: metadata.height,
        muteAudio: options.muteAudio,
      });
      exitCode = await ffmpeg.exec([
        "-i",
        inputName,
        ...activePlan.ffmpegVideoArgs,
        "-y",
        outputName,
      ]);
      if (exitCode === 0) {
        const secondOut = await ffmpeg.readFile(outputName);
        const secondBytes =
          typeof secondOut === "string"
            ? new TextEncoder().encode(secondOut)
            : new Uint8Array(secondOut);
        if (secondBytes.byteLength < outBytes.byteLength) {
          outBytes = secondBytes;
        }
      }
    }

    if (outBytes.byteLength > options.targetBytes) {
      warnings.push(
        "Video hit minimum readable bitrate for its duration; consider trimming or muting audio to go smaller."
      );
    }

    const bufferCopy = new Uint8Array(outBytes.byteLength);
    bufferCopy.set(outBytes);
    const blob = new Blob([bufferCopy.buffer], { type: "video/mp4" });
    options.onProgress?.(100, "Done — zero bytes uploaded");

    return {
      blob,
      outputSize: blob.size,
      engineUsed: mode,
      plan: activePlan,
      metadata,
      warnings,
    };
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => false);
    await ffmpeg.deleteFile(outputName).catch(() => false);
  }
}

async function compressVideoWithBrowserNative(
  file: File,
  metadata: VideoMetadata,
  options: VideoCompressOptions
): Promise<VideoCompressResult> {
  if (typeof MediaRecorder === "undefined" || typeof document === "undefined") {
    throw new Error("Browser video encoding is unavailable in this environment.");
  }

  const plan = planVideoCompression({
    durationSeconds: metadata.durationSeconds,
    originalBytes: file.size,
    targetBytes: options.targetBytes,
    width: metadata.width,
    height: metadata.height,
    muteAudio: options.muteAudio,
  });
  options.onPlanReady?.(plan, metadata);

  const scaleFactor =
    plan.maxHeight && metadata.height > plan.maxHeight
      ? plan.maxHeight / metadata.height
      : 1;
  const outW = Math.max(2, Math.round((metadata.width * scaleFactor) / 2) * 2);
  const outH = Math.max(2, Math.round((metadata.height * scaleFactor) / 2) * 2);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  const video = document.createElement("video");
  const srcUrl = URL.createObjectURL(file);
  video.src = srcUrl;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  // Must stay muted so browser autoplay policy never blocks programmatic encode after async awaits
  video.muted = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not decode local video stream"));
    });

    const stream = canvas.captureStream(plan.targetFps);
    const mimeCandidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mimeType =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: plan.videoKbps * 1000,
      audioBitsPerSecond: plan.audioKbps * 1000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
    });

    let rafId = 0;
    const drawFrame = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, outW, outH);
      const pct = Math.min(
        96,
        Math.round(20 + (video.currentTime / Math.max(1, metadata.durationSeconds)) * 75)
      );
      options.onProgress?.(pct, "Encoding locally with browser hardware codec...");
      rafId = requestAnimationFrame(drawFrame);
    };

    recorder.start(250);
    await video.play();
    drawFrame();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    cancelAnimationFrame(rafId);
    ctx.drawImage(video, 0, 0, outW, outH);
    recorder.stop();
    const blob = await finished;

    options.onProgress?.(100, "Done — browser-native fallback");
    return {
      blob,
      outputSize: blob.size,
      engineUsed: "browser-native",
      plan,
      metadata,
      warnings: [
        "Wasm CDN unreachable offline — used built-in browser hardware codec fallback.",
      ],
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    URL.revokeObjectURL(srcUrl);
  }
}

export async function compressVideoLocally(
  file: File,
  options: VideoCompressOptions
): Promise<VideoCompressResult> {
  options.onProgress?.(4, "Reading video dimensions & duration locally...");
  const metadata = await probeVideoMetadata(file);

  try {
    return await compressWithFfmpegWasm(file, metadata, options);
  } catch (wasmErr) {
    // Graceful fallback if offline before Wasm was cached or network blocked CDN
    try {
      options.onProgress?.(
        14,
        "Switching to built-in browser hardware video codec..."
      );
      return await compressVideoWithBrowserNative(file, metadata, options);
    } catch {
      const reason =
        wasmErr instanceof Error ? wasmErr.message : "Video compression failed";
      throw new Error(reason);
    }
  }
}
