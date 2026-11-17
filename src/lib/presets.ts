import type { DestinationPreset, FileKind, PresetId } from "../types/compression";

export const DESTINATION_PRESETS: DestinationPreset[] = [
  {
    id: "discord",
    label: "Discord",
    limitLabel: "25 MB",
    targetMB: 25,
    safeCapMB: 24.3,
    description: "Fits standard Discord server & DM uploads without Nitro.",
    audienceTag: "Clips & Screen Captures",
  },
  {
    id: "email",
    label: "Email",
    limitLabel: "20 MB",
    targetMB: 20,
    safeCapMB: 19.3,
    description: "Clears Gmail, Outlook, and corporate attachment filters.",
    audienceTag: "Client Recordings",
  },
  {
    id: "court",
    label: "Court Portal",
    limitLabel: "2 MB",
    targetMB: 2,
    safeCapMB: 1.9,
    description: "Strict legal e-filing & government portal upload cap.",
    audienceTag: "Legal PDFs & Exhibits",
  },
  {
    id: "slack",
    label: "Slack / Teams",
    limitLabel: "10 MB",
    targetMB: 10,
    safeCapMB: 9.6,
    description: "Fast inline preview in Slack, Teams, and Notion.",
    audienceTag: "Team Updates",
  },
];

export const MB_IN_BYTES = 1024 * 1024;

export function getPresetById(id: PresetId): DestinationPreset | undefined {
  return DESTINATION_PRESETS.find((preset) => preset.id === id);
}

export function getSafeTargetBytes(presetId: PresetId, customMB: number): number {
  const preset = getPresetById(presetId);
  if (preset) {
    return Math.round(preset.safeCapMB * MB_IN_BYTES);
  }
  const clamped = Math.max(0.4, Math.min(200, customMB));
  const safetyMultiplier = clamped <= 3 ? 0.94 : 0.97;
  return Math.round(clamped * safetyMultiplier * MB_IN_BYTES);
}

export function detectFileKind(file: Pick<File, "name" | "type">): FileKind | null {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    type.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|avi|m4v|ogv)$/i.test(name)
  ) {
    return "video";
  }

  if (
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|bmp)$/i.test(name)
  ) {
    return "image";
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 1 : 2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function computeSavingsPercent(originalSize: number, outputSize: number): number {
  if (originalSize <= 0) return 0;
  return Math.round(((originalSize - outputSize) / originalSize) * 100);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function buildCompressedFilename(
  originalName: string,
  kind: FileKind,
  outputMimeType?: string
): string {
  const dotIdx = originalName.lastIndexOf(".");
  const base = dotIdx > 0 ? originalName.slice(0, dotIdx) : originalName;
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (kind === "video") {
    const ext = outputMimeType?.includes("webm") ? "webm" : "mp4";
    return `${safeBase}-compressed.${ext}`;
  }
  if (kind === "pdf") return `${safeBase}-compressed.pdf`;
  return `${safeBase}-compressed.jpg`;
}
