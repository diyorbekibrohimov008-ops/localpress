import type { VideoCompressionPlan } from "../types/compression";

export interface VideoPlanInput {
  durationSeconds: number;
  originalBytes: number;
  targetBytes: number;
  width?: number;
  height?: number;
  muteAudio?: boolean;
}

/**
 * Computes optimal H.264 + AAC target-size parameters without exposing
 * technical codec or bitrate dials to the user.
 */
export function planVideoCompression(input: VideoPlanInput): VideoCompressionPlan {
  const safeDuration = Math.max(1, input.durationSeconds || 1);
  const safeTargetBytes = Math.max(200 * 1024, input.targetBytes);

  // Reserve 5% for MP4 container muxing overhead and bitrate overshoot spikes.
  const containerSafety = 0.95;
  const totalBudgetKbps = Math.floor(
    (safeTargetBytes * containerSafety * 8) / (safeDuration * 1000)
  );

  let audioKbps = 0;
  if (!input.muteAudio) {
    if (totalBudgetKbps < 260) {
      audioKbps = 48;
    } else if (totalBudgetKbps < 850) {
      audioKbps = 64;
    } else if (totalBudgetKbps < 2200) {
      audioKbps = 96;
    } else {
      audioKbps = 128;
    }
  }

  const videoKbps = Math.max(70, totalBudgetKbps - audioKbps);
  const sourceHeight = input.height && input.height > 0 ? input.height : 1080;

  let maxHeight: number | null = null;
  let targetFps = 30;
  let qualitySummary = "Crisp 1080p HD — High clarity";

  if (videoKbps >= 2500) {
    maxHeight = sourceHeight > 1080 ? 1080 : null;
    targetFps = 30;
    qualitySummary = "Crisp 1080p HD — Great for desktop & Discord";
  } else if (videoKbps >= 900) {
    maxHeight = sourceHeight > 720 ? 720 : null;
    targetFps = 30;
    qualitySummary = "Sharp 720p HD — Balanced size & detail";
  } else if (videoKbps >= 360) {
    maxHeight = sourceHeight > 480 ? 480 : null;
    targetFps = 24;
    qualitySummary = "Compact 480p — Smooth playback under strict caps";
  } else {
    maxHeight = sourceHeight > 360 ? 360 : null;
    targetFps = videoKbps < 160 ? 20 : 24;
    qualitySummary = "Ultra-compact 360p — Optimized for tight portal caps";
  }

  const scaleFilter = maxHeight
    ? `scale=-2:'min(ih,${maxHeight})'`
    : "scale=trunc(iw/2)*2:trunc(ih/2)*2";

  const ffmpegVideoArgs = [
    "-vf",
    scaleFilter,
    "-r",
    String(targetFps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    `${videoKbps}k`,
    "-maxrate",
    `${Math.round(videoKbps * 1.15)}k`,
    "-bufsize",
    `${Math.round(videoKbps * 2)}k`,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  ];

  if (input.muteAudio || audioKbps === 0) {
    ffmpegVideoArgs.push("-an");
  } else {
    ffmpegVideoArgs.push("-c:a", "aac", "-b:a", `${audioKbps}k`);
    if (audioKbps <= 48) {
      ffmpegVideoArgs.push("-ac", "1");
    }
  }

  return {
    videoKbps,
    audioKbps,
    maxHeight,
    targetFps,
    qualitySummary,
    alreadyUnderTarget: input.originalBytes <= safeTargetBytes,
    ffmpegVideoArgs,
  };
}

export function describeTargetForecast(
  targetMB: number,
  originalBytes: number
): string {
  const ratio = originalBytes > 0 ? (targetMB * 1024 * 1024) / originalBytes : 1;
  if (targetMB <= 2.2) {
    return "Strict portal mode — prioritizes fitting under 2 MB";
  }
  if (ratio >= 0.9) {
    return "Light cleanup — keeps near-original visual fidelity";
  }
  if (ratio >= 0.4) {
    return "Smart balance — sharp visuals with major size savings";
  }
  return "Aggressive shrink — auto-scales resolution to avoid blockiness";
}
