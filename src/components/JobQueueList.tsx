import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { computeSavingsPercent, formatBytes } from "../lib/presets";
import type { CompressionJob, EngineMode } from "../types/compression";

interface JobQueueListProps {
  jobs: CompressionJob[];
  isPro: boolean;
  activeTargetMB: number;
  isProcessing: boolean;
  onStartSingle: (id: string) => void;
  onRunBatch: () => void;
  onDownloadOne: (job: CompressionJob) => void;
  onDownloadZip: () => void;
  onRemoveJob: (id: string) => void;
  onRecompressWithTarget: (id: string) => void;
  onOpenUpgrade: () => void;
}

const ENGINE_LABELS: Record<EngineMode, string> = {
  "ffmpeg-mt": "FFmpeg.wasm (Multi-Thread)",
  "ffmpeg-st": "FFmpeg.wasm (Single-Thread)",
  "browser-native": "Browser Hardware Codec",
  "pdf-structural": "PDF Optimizer (Text Preserved)",
  "pdf-raster": "PDF Deep Page Shrink",
  "image-canvas": "Canvas Binary Search",
};

export function JobQueueList({
  jobs,
  isPro,
  activeTargetMB,
  isProcessing,
  onStartSingle,
  onRunBatch,
  onDownloadOne,
  onDownloadZip,
  onRemoveJob,
  onRecompressWithTarget,
  onOpenUpgrade,
}: JobQueueListProps) {
  if (jobs.length === 0) return null;

  const completedJobs = jobs.filter((j) => j.status === "done" && j.outputBlob);
  const queuedJobs = jobs.filter((j) => j.status === "queued");

  return (
    <section
      aria-label="Compression queue"
      className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">
            Local Queue ({jobs.length} {jobs.length === 1 ? "file" : "files"})
          </h2>
          <p className="text-xs text-slate-400">
            {isPro
              ? "Pro Lifetime active — compress entire batches and download as a single ZIP."
              : "Free Tier compresses 1 file at a time. Upgrade once ($15) for batch queue + ZIP export."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {queuedJobs.length > 1 && isPro && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={onRunBatch}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-300 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Compress All ({queuedJobs.length})
            </button>
          )}

          {queuedJobs.length > 1 && !isPro && (
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock Batch Queue ($15 Lifetime)
            </button>
          )}

          {completedJobs.length >= 2 && (
            <button
              type="button"
              onClick={isPro ? onDownloadZip : onOpenUpgrade}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/15 px-3.5 py-2 text-xs font-semibold text-teal-200 transition hover:bg-teal-500/25"
            >
              <Archive className="h-3.5 w-3.5" />
              {isPro
                ? `Download All (${completedJobs.length}) .zip`
                : "Download All .zip (Pro)"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => {
          const KindIcon =
            job.kind === "video"
              ? Film
              : job.kind === "pdf"
                ? FileText
                : ImageIcon;
          const savings =
            job.outputSize !== undefined
              ? computeSavingsPercent(job.originalSize, job.outputSize)
              : 0;
          const fitsTarget =
            job.outputSize !== undefined &&
            job.outputSize <= job.targetMB * 1024 * 1024;

          return (
            <div
              key={job.id}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-teal-300">
                    <KindIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                      {job.file.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>Original: {formatBytes(job.originalSize)}</span>
                      <span>&bull;</span>
                      <span>Target: &le; {job.targetMB} MB</span>
                      {job.engineUsed && (
                        <>
                          <span>&bull;</span>
                          <span className="inline-flex items-center gap-1 text-slate-300">
                            <Cpu className="h-3 w-3 text-teal-400" />
                            {ENGINE_LABELS[job.engineUsed]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {job.status === "queued" && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => onStartSingle(job.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-teal-300 disabled:opacity-50"
                    >
                      <Play className="h-3 w-3" />
                      Compress Now
                    </button>
                  )}

                  {job.status === "done" && job.outputBlob && (
                    <>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => onRecompressWithTarget(job.id)}
                        title={`Re-run with current target (${activeTargetMB} MB)`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Re-run ({activeTargetMB} MB)
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadOne(job)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </>
                  )}

                  {job.status === "error" && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => onStartSingle(job.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label={`Remove ${job.file.name}`}
                    disabled={
                      job.status === "compressing" || job.status === "probing"
                    }
                    onClick={() => onRemoveJob(job.id)}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {(job.status === "probing" || job.status === "compressing") && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-teal-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {job.stageLabel}
                    </span>
                    <span className="font-mono text-slate-300">{job.progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-400 to-sky-400 transition-all duration-200"
                      style={{ width: `${Math.max(4, job.progress)}%` }}
                    />
                  </div>
                </div>
              )}

              {job.status === "done" && job.outputSize !== undefined && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-xs">
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${
                      fitsTarget ? "text-emerald-400" : "text-amber-400"
                    }`}
                  />
                  <span className="font-semibold text-white">
                    {formatBytes(job.originalSize)} &rarr; {formatBytes(job.outputSize)}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-semibold ${
                      savings > 0
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {savings >= 0 ? `-${savings}%` : `+${Math.abs(savings)}%`}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 font-medium ${
                      fitsTarget
                        ? "bg-teal-500/15 text-teal-300"
                        : "bg-amber-500/15 text-amber-200"
                    }`}
                  >
                    {fitsTarget
                      ? `Fits ≤ ${job.targetMB} MB ✓`
                      : `Exceeds ${job.targetMB} MB cap`}
                  </span>
                  {job.durationMs !== undefined && (
                    <span className="text-slate-400">
                      in {(job.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {job.kind === "pdf" && job.textPreserved !== undefined && (
                    <span className="text-slate-300">
                      &bull; {job.textPreserved ? "Selectable text kept" : "Page-image scan"}
                    </span>
                  )}
                  {job.qualityNote && (
                    <span className="text-slate-400">&bull; {job.qualityNote}</span>
                  )}
                </div>
              )}

              {job.warnings && job.warnings.length > 0 && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{job.warnings.join(" ")}</span>
                </div>
              )}

              {job.status === "error" && job.error && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{job.error}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
