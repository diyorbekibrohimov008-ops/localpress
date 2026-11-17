import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { DropzoneCard } from "./components/DropzoneCard";
import { JobQueueList } from "./components/JobQueueList";
import { PresetSelector } from "./components/PresetSelector";
import { PrivacyAuditDrawer } from "./components/PrivacyAuditDrawer";
import { UpgradeModal } from "./components/UpgradeModal";
import { compressImageLocally } from "./lib/imageEngine";
import {
  activateProLicense,
  clearProLicense,
  loadLicenseState,
  type LicenseState,
} from "./lib/license";
import { compressPdfLocally } from "./lib/pdfEngine";
import {
  buildCompressedFilename,
  DESTINATION_PRESETS,
  detectFileKind,
  formatBytes,
  getSafeTargetBytes,
} from "./lib/presets";
import {
  getInitialPrivacyMetrics,
  installZeroUploadAudit,
} from "./lib/privacyGuard";
import {
  generateSampleLegalPdf,
  generateSampleTestVideo,
} from "./lib/sampleFiles";
import { compressVideoLocally } from "./lib/videoEngine";
import { createZipBlobFromBlobs } from "./lib/zipWriter";
import type {
  CompressionJob,
  PresetId,
  PrivacyMetrics,
} from "./types/compression";

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function App() {
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("discord");
  const [customMB, setCustomMB] = useState<number>(25);
  const [muteAudio, setMuteAudio] = useState<boolean>(false);
  const [jobs, setJobs] = useState<CompressionJob[]>([]);
  const [license, setLicense] = useState<LicenseState>(() => loadLicenseState());
  const [privacyMetrics, setPrivacyMetrics] = useState<PrivacyMetrics>(() =>
    getInitialPrivacyMetrics()
  );
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState<"pdf" | "video" | null>(null);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const activeTargetMB = useMemo(() => {
    if (selectedPreset === "custom") return customMB;
    return (
      DESTINATION_PRESETS.find((p) => p.id === selectedPreset)?.targetMB ??
      customMB
    );
  }, [selectedPreset, customMB]);

  const isProcessing = jobs.some(
    (j) => j.status === "probing" || j.status === "compressing"
  );

  useEffect(() => {
    const cleanup = installZeroUploadAudit();
    return cleanup;
  }, []);

  const updateJob = useCallback(
    (id: string, patch: Partial<CompressionJob>) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...patch } : j))
      );
    },
    []
  );

  const handleSelectPreset = (id: Exclude<PresetId, "custom">) => {
    const preset = DESTINATION_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setSelectedPreset(id);
    setCustomMB(preset.targetMB);
    setJobs((prev) =>
      prev.map((j) =>
        j.status === "queued" ? { ...j, targetMB: preset.targetMB } : j
      )
    );
  };

  const handleChangeCustomMB = (mb: number) => {
    setSelectedPreset("custom");
    setCustomMB(mb);
    setJobs((prev) =>
      prev.map((j) => (j.status === "queued" ? { ...j, targetMB: mb } : j))
    );
  };

  const enqueueFiles = useCallback(
    (incoming: File[], overrideTargetMB?: number) => {
      setBannerError(null);
      const effectiveMB = overrideTargetMB ?? activeTargetMB;
      const accepted: CompressionJob[] = [];
      const rejected: string[] = [];

      for (const file of incoming) {
        const kind = detectFileKind(file);
        if (!kind) {
          rejected.push(file.name);
          continue;
        }
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          kind,
          originalSize: file.size,
          targetMB: effectiveMB,
          status: "queued",
          progress: 0,
          stageLabel: "Ready in local browser memory",
        });
      }

      if (rejected.length > 0) {
        setBannerError(
          `Unsupported file format skipped: ${rejected.join(", ")}. Supported: MP4, MOV, WebM, MKV, PDF, JPG, PNG, WebP.`
        );
      }

      if (accepted.length > 0) {
        setJobs((prev) => [...prev, ...accepted]);
      }
    },
    [activeTargetMB]
  );

  const executeJob = useCallback(
    async (jobId: string, overrideMB?: number) => {
      const targetJob = jobsRef.current.find((j) => j.id === jobId);
      if (!targetJob) return;

      const effectiveMB = overrideMB ?? targetJob.targetMB;
      const presetForTarget: PresetId =
        selectedPreset !== "custom" &&
        DESTINATION_PRESETS.find((p) => p.id === selectedPreset)?.targetMB ===
          effectiveMB
          ? selectedPreset
          : "custom";

      const targetBytes = getSafeTargetBytes(presetForTarget, effectiveMB);
      const startedAt = performance.now();

      updateJob(jobId, {
        status: "compressing",
        targetMB: effectiveMB,
        progress: 5,
        stageLabel: "Starting local WebAssembly engine...",
        error: undefined,
        warnings: undefined,
      });

      try {
        if (targetJob.kind === "pdf") {
          const result = await compressPdfLocally(targetJob.file, {
            targetBytes,
            onProgress: (pct, stage) =>
              updateJob(jobId, { progress: pct, stageLabel: stage }),
          });
          const elapsed = performance.now() - startedAt;
          updateJob(jobId, {
            status: "done",
            progress: 100,
            stageLabel: "Complete",
            outputBlob: result.blob,
            outputSize: result.outputSize,
            outputName: buildCompressedFilename(targetJob.file.name, "pdf"),
            durationMs: elapsed,
            engineUsed: result.engineUsed,
            textPreserved: result.textPreserved,
            qualityNote:
              result.imagesRecompressed > 0
                ? `${result.imagesRecompressed} embedded image(s) optimized`
                : undefined,
            warnings: result.warnings,
          });
          setPrivacyMetrics((m) => ({
            ...m,
            jobsCompletedLocally: m.jobsCompletedLocally + 1,
            totalBytesSaved:
              m.totalBytesSaved +
              Math.max(0, targetJob.originalSize - result.outputSize),
          }));
        } else if (targetJob.kind === "image") {
          const result = await compressImageLocally(targetJob.file, {
            targetBytes,
            onProgress: (pct, stage) =>
              updateJob(jobId, { progress: pct, stageLabel: stage }),
          });
          const elapsed = performance.now() - startedAt;
          updateJob(jobId, {
            status: "done",
            progress: 100,
            stageLabel: "Complete",
            outputBlob: result.blob,
            outputSize: result.outputSize,
            outputName: buildCompressedFilename(targetJob.file.name, "image"),
            durationMs: elapsed,
            engineUsed: result.engineUsed,
            warnings: result.warnings,
          });
          setPrivacyMetrics((m) => ({
            ...m,
            jobsCompletedLocally: m.jobsCompletedLocally + 1,
            totalBytesSaved:
              m.totalBytesSaved +
              Math.max(0, targetJob.originalSize - result.outputSize),
          }));
        } else {
          const result = await compressVideoLocally(targetJob.file, {
            targetBytes,
            muteAudio,
            onProgress: (pct, stage) =>
              updateJob(jobId, { progress: pct, stageLabel: stage }),
          });
          const elapsed = performance.now() - startedAt;
          updateJob(jobId, {
            status: "done",
            progress: 100,
            stageLabel: "Complete",
            outputBlob: result.blob,
            outputSize: result.outputSize,
            outputName: buildCompressedFilename(
              targetJob.file.name,
              "video",
              result.blob.type
            ),
            durationMs: elapsed,
            engineUsed: result.engineUsed,
            qualityNote: result.plan.qualitySummary,
            warnings: result.warnings,
          });
          setPrivacyMetrics((m) => ({
            ...m,
            wasmRuntimeCached:
              result.engineUsed === "ffmpeg-mt" ||
              result.engineUsed === "ffmpeg-st",
            jobsCompletedLocally: m.jobsCompletedLocally + 1,
            totalBytesSaved:
              m.totalBytesSaved +
              Math.max(0, targetJob.originalSize - result.outputSize),
          }));
        }
      } catch (err) {
        updateJob(jobId, {
          status: "error",
          progress: 0,
          stageLabel: "Failed",
          error:
            err instanceof Error
              ? err.message
              : "Unexpected compression error",
        });
      }
    },
    [muteAudio, selectedPreset, updateJob]
  );

  const handleRunBatch = async () => {
    if (!license.isPro) {
      setUpgradeOpen(true);
      return;
    }
    const queuedIds = jobsRef.current
      .filter((j) => j.status === "queued")
      .map((j) => j.id);
    for (const id of queuedIds) {
      await executeJob(id);
    }
  };

  const handleDownloadZip = async () => {
    if (!license.isPro) {
      setUpgradeOpen(true);
      return;
    }
    const doneFiles = jobs
      .filter((j) => j.status === "done" && j.outputBlob)
      .map((j) => ({
        name: j.outputName ?? buildCompressedFilename(j.file.name, j.kind),
        blob: j.outputBlob as Blob,
      }));
    if (doneFiles.length === 0) return;
    const zipBlob = await createZipBlobFromBlobs(doneFiles);
    triggerBlobDownload(zipBlob, `localpress-batch-${doneFiles.length}.zip`);
  };

  const handleGenerateSamplePdf = async () => {
    setSampleBusy("pdf");
    setBannerError(null);
    try {
      const pdfFile = await generateSampleLegalPdf();
      // Auto-select Court Portal (2 MB) so user can test strict legal PDF shrinking right away
      setSelectedPreset("court");
      setCustomMB(2);
      enqueueFiles([pdfFile], 2);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to generate sample PDF"
      );
    } finally {
      setSampleBusy(null);
    }
  };

  const handleGenerateSampleVideo = async () => {
    setSampleBusy("video");
    setBannerError(null);
    try {
      const videoFile = await generateSampleTestVideo();
      // Suggest 1.5 MB target so compression savings on the 3.6 MB sample clip are dramatic
      setSelectedPreset("court");
      setCustomMB(2);
      enqueueFiles([videoFile], 2);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to generate sample video"
      );
    } finally {
      setSampleBusy(null);
    }
  };

  const referenceOriginalBytes =
    jobs[jobs.length - 1]?.originalSize ?? 45 * 1024 * 1024;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Ambient top glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-gradient-to-b from-teal-500/10 via-sky-500/5 to-transparent" />

      <header className="relative border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-sky-400 text-slate-950 shadow-md shadow-teal-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">
                  LocalPress
                </span>
                <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-300">
                  Wasm Local
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Zero-cloud video &amp; legal PDF compression
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{privacyMetrics.bytesUploaded} B uploaded</span>
              <span className="text-emerald-500/60">&bull;</span>
              <span className="inline-flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {privacyMetrics.sharedArrayBufferReady ? "MT Wasm" : "Local Wasm"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                license.isPro
                  ? "border border-teal-400/40 bg-teal-500/15 text-teal-200 hover:bg-teal-500/25"
                  : "bg-amber-400 text-slate-950 hover:bg-amber-300"
              }`}
            >
              {license.isPro ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Pro Lifetime Unlocked
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Unlock Batch ($15 Once)
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Shrink files to fit your destination.{" "}
            <span className="text-teal-300">Never upload a byte.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Skip cloud subscriptions and confusing bitrate dials. Pick Discord (25MB), Email (20MB), or Court Portal (2MB) — FFmpeg &amp; PDF optimization run directly on your device on Windows, Mac, or Chromebook.
          </p>
        </div>

        {bannerError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"
          >
            {bannerError}
          </div>
        )}

        <PresetSelector
          selectedPreset={selectedPreset}
          customMB={customMB}
          muteAudio={muteAudio}
          referenceOriginalBytes={referenceOriginalBytes}
          onSelectPreset={handleSelectPreset}
          onChangeCustomMB={handleChangeCustomMB}
          onToggleMuteAudio={setMuteAudio}
        />

        <DropzoneCard
          onFilesSelected={(files) => enqueueFiles(files)}
          onGenerateSamplePdf={handleGenerateSamplePdf}
          onGenerateSampleVideo={handleGenerateSampleVideo}
          sampleBusy={sampleBusy}
        />

        <JobQueueList
          jobs={jobs}
          isPro={license.isPro}
          activeTargetMB={activeTargetMB}
          isProcessing={isProcessing}
          onStartSingle={(id) => void executeJob(id)}
          onRunBatch={() => void handleRunBatch()}
          onDownloadOne={(job) => {
            if (job.outputBlob) {
              triggerBlobDownload(
                job.outputBlob,
                job.outputName ?? buildCompressedFilename(job.file.name, job.kind)
              );
            }
          }}
          onDownloadZip={() => void handleDownloadZip()}
          onRemoveJob={(id) =>
            setJobs((prev) => prev.filter((j) => j.id !== id))
          }
          onRecompressWithTarget={(id) => void executeJob(id, activeTargetMB)}
          onOpenUpgrade={() => setUpgradeOpen(true)}
        />

        {/* Subtle Footer Value Summary */}
        <footer className="grid grid-cols-1 gap-3 border-t border-slate-800/80 pt-6 text-xs text-slate-400 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3.5">
            <div className="font-semibold text-slate-200">Zero Cloud Privacy</div>
            <p className="mt-1">
              Legal PDFs &amp; client recordings stay in browser RAM. Verified 0 bytes uploaded.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3.5">
            <div className="font-semibold text-slate-200">No Bitrate Dials</div>
            <p className="mt-1">
              Auto-calculates optimal H.264/AAC &amp; PDF image density to stay strictly under cap.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3.5">
            <div className="font-semibold text-slate-200">
              Free Single-File • $15 Batch
            </div>
            <p className="mt-1">
              Free forever 1-by-1. Unlock multi-file batch + ZIP export once for $15 (no subscription).
            </p>
          </div>
        </footer>
      </main>

      <UpgradeModal
        open={upgradeOpen}
        isPro={license.isPro}
        activeKey={license.licenseKey}
        onClose={() => setUpgradeOpen(false)}
        onActivateKey={(key) => setLicense(activateProLicense(key))}
        onResetLicense={() => setLicense(clearProLicense())}
      />

      <PrivacyAuditDrawer
        open={privacyOpen}
        metrics={{
          ...privacyMetrics,
          totalBytesSaved:
            privacyMetrics.totalBytesSaved ||
            jobs.reduce(
              (acc, j) =>
                j.outputSize !== undefined
                  ? acc + Math.max(0, j.originalSize - j.outputSize)
                  : acc,
              0
            ),
        }}
        onClose={() => setPrivacyOpen(false)}
      />

      {/* Hidden quick telemetry helper for automated tests */}
      <div className="sr-only" data-testid="saved-total">
        {formatBytes(privacyMetrics.totalBytesSaved)}
      </div>
    </div>
  );
}
