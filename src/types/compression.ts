export type FileKind = "video" | "pdf" | "image";

export type PresetId = "discord" | "email" | "court" | "slack" | "custom";

export type EngineMode =
  | "ffmpeg-mt"
  | "ffmpeg-st"
  | "browser-native"
  | "pdf-structural"
  | "pdf-raster"
  | "image-canvas";

export type JobStatus =
  | "queued"
  | "probing"
  | "compressing"
  | "done"
  | "error";

export interface DestinationPreset {
  id: Exclude<PresetId, "custom">;
  label: string;
  limitLabel: string;
  targetMB: number;
  safeCapMB: number;
  description: string;
  audienceTag: string;
}

export interface VideoCompressionPlan {
  videoKbps: number;
  audioKbps: number;
  maxHeight: number | null;
  targetFps: number;
  qualitySummary: string;
  alreadyUnderTarget: boolean;
  ffmpegVideoArgs: string[];
}

export interface CompressionJob {
  id: string;
  file: File;
  kind: FileKind;
  originalSize: number;
  targetMB: number;
  status: JobStatus;
  progress: number;
  stageLabel: string;
  outputBlob?: Blob;
  outputSize?: number;
  outputName?: string;
  durationMs?: number;
  engineUsed?: EngineMode;
  qualityNote?: string;
  textPreserved?: boolean;
  error?: string;
  warnings?: string[];
}

export interface PrivacyMetrics {
  crossOriginIsolated: boolean;
  sharedArrayBufferReady: boolean;
  bytesUploaded: number;
  wasmRuntimeCached: boolean;
  jobsCompletedLocally: number;
  totalBytesSaved: number;
}
