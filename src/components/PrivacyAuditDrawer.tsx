import { Cpu, Lock, ShieldCheck, X } from "lucide-react";
import { formatBytes } from "../lib/presets";
import type { PrivacyMetrics } from "../types/compression";

interface PrivacyAuditDrawerProps {
  open: boolean;
  metrics: PrivacyMetrics;
  onClose: () => void;
}

export function PrivacyAuditDrawer({
  open,
  metrics,
  onClose,
}: PrivacyAuditDrawerProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-audit-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 id="privacy-audit-title" className="text-lg font-bold text-white">
                Zero-Cloud Privacy &amp; Comparison Audit
              </h3>
              <p className="text-xs text-slate-400">
                Live telemetry from this browser tab
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close privacy audit"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
            <div className="text-xs text-slate-400">File Bytes Uploaded</div>
            <div className="mt-1 text-lg font-bold text-emerald-400">
              {metrics.bytesUploaded} B
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
            <div className="text-xs text-slate-400">Wasm Thread Mode</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
              <Cpu className="h-4 w-4 text-teal-400" />
              {metrics.sharedArrayBufferReady ? "Multi-Thread" : "Single-Thread"}
            </div>
          </div>
          <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3 sm:col-span-1">
            <div className="text-xs text-slate-400">Total Shrunk Locally</div>
            <div className="mt-1 text-lg font-bold text-sky-300">
              {formatBytes(metrics.totalBytesSaved)}
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Tool</th>
                <th className="px-3 py-2.5">Privacy</th>
                <th className="px-3 py-2.5">Platform</th>
                <th className="px-3 py-2.5">Pricing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/60 text-slate-200">
              <tr className="bg-teal-500/10 font-medium">
                <td className="px-3 py-2.5 text-teal-300">LocalPress (You)</td>
                <td className="px-3 py-2.5 text-emerald-300">0 uploads (Wasm)</td>
                <td className="px-3 py-2.5">Win / Mac / Chromebook</td>
                <td className="px-3 py-2.5">Free / $15 Batch</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5">Clideo</td>
                <td className="px-3 py-2.5 text-rose-300">Cloud upload</td>
                <td className="px-3 py-2.5">Web</td>
                <td className="px-3 py-2.5">$9 / month</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5">CompressX</td>
                <td className="px-3 py-2.5">Offline local</td>
                <td className="px-3 py-2.5 text-amber-300">Mac-only</td>
                <td className="px-3 py-2.5">$29 one-time</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5">HandBrake</td>
                <td className="px-3 py-2.5">Offline local</td>
                <td className="px-3 py-2.5">Desktop (bitrate dials)</td>
                <td className="px-3 py-2.5">Free</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5 text-emerald-400" />
          <span>
            Active zero-upload fetch guard intercepts and blocks any non-GET payload during compression.
          </span>
        </div>
      </div>
    </div>
  );
}
