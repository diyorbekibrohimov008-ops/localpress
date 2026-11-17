import { describe, expect, it } from "vitest";
import { planVideoCompression } from "../bitratePlanner";
import {
  buildCompressedFilename,
  computeSavingsPercent,
  DESTINATION_PRESETS,
  detectFileKind,
  formatBytes,
  getSafeTargetBytes,
} from "../presets";

describe("destination presets & file detection", () => {
  it("provides Discord 25MB, Email 20MB, and Court Portal 2MB presets with safe margins", () => {
    const discord = DESTINATION_PRESETS.find((p) => p.id === "discord");
    const email = DESTINATION_PRESETS.find((p) => p.id === "email");
    const court = DESTINATION_PRESETS.find((p) => p.id === "court");

    expect(discord?.targetMB).toBe(25);
    expect(email?.targetMB).toBe(20);
    expect(court?.targetMB).toBe(2);

    expect(getSafeTargetBytes("discord", 25)).toBeLessThan(25 * 1024 * 1024);
    expect(getSafeTargetBytes("email", 20)).toBeLessThan(20 * 1024 * 1024);
    expect(getSafeTargetBytes("court", 2)).toBeLessThan(2 * 1024 * 1024);
  });

  it("detects video, pdf, image, and rejects unsupported types", () => {
    expect(detectFileKind({ name: "deposition.mov", type: "" })).toBe("video");
    expect(detectFileKind({ name: "brief.pdf", type: "application/pdf" })).toBe("pdf");
    expect(detectFileKind({ name: "scan.png", type: "image/png" })).toBe("image");
    expect(detectFileKind({ name: "installer.exe", type: "application/x-msdownload" })).toBeNull();
  });

  it("formats bytes and filenames cleanly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.00 MB");
    expect(computeSavingsPercent(1000, 250)).toBe(75);
    expect(buildCompressedFilename("my video (final).mov", "video")).toBe(
      "my_video_final_-compressed.mp4"
    );
  });
});

describe("planVideoCompression", () => {
  it("scales down resolution and adjusts bitrate for strict 2MB court portal targets", () => {
    const plan = planVideoCompression({
      durationSeconds: 45,
      originalBytes: 42 * 1024 * 1024,
      targetBytes: 1.9 * 1024 * 1024,
      width: 1920,
      height: 1080,
      muteAudio: false,
    });

    expect(plan.maxHeight).toBeLessThanOrEqual(480);
    expect(plan.videoKbps).toBeGreaterThanOrEqual(70);
    expect(plan.audioKbps).toBeLessThanOrEqual(64);
    expect(plan.ffmpegVideoArgs).toContain("libx264");
    expect(plan.alreadyUnderTarget).toBe(false);
  });

  it("allocates full budget to video when muteAudio is enabled", () => {
    const withAudio = planVideoCompression({
      durationSeconds: 20,
      originalBytes: 40 * 1024 * 1024,
      targetBytes: 10 * 1024 * 1024,
      muteAudio: false,
    });
    const muted = planVideoCompression({
      durationSeconds: 20,
      originalBytes: 40 * 1024 * 1024,
      targetBytes: 10 * 1024 * 1024,
      muteAudio: true,
    });

    expect(muted.audioKbps).toBe(0);
    expect(muted.videoKbps).toBeGreaterThan(withAudio.videoKbps);
    expect(muted.ffmpegVideoArgs).toContain("-an");
  });
});
