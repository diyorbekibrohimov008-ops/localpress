import { useState } from "react";
import { Check, KeyRound, Sparkles, X } from "lucide-react";
import { DEMO_PRO_KEY } from "../lib/license";

interface UpgradeModalProps {
  open: boolean;
  isPro: boolean;
  activeKey: string | null;
  onClose: () => void;
  onActivateKey: (key: string) => void;
  onResetLicense: () => void;
}

export function UpgradeModal({
  open,
  isPro,
  activeKey,
  onClose,
  onActivateKey,
  onResetLicense,
}: UpgradeModalProps) {
  const [keyInput, setKeyInput] = useState(DEMO_PRO_KEY);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      onActivateKey(keyInput);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid key");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              $15 Lifetime Upgrade — No Subscriptions
            </span>
            <h3
              id="upgrade-modal-title"
              className="mt-2 text-xl font-bold text-white"
            >
              LocalPress Pro Batch &amp; Desktop
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              One-time $15 license — half the price of Mac-only CompressX ($29) and cheaper than 2 months of cloud-uploading Clideo ($9/mo).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upgrade modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm">
          {[
            "Unlimited multi-file batch queue (drag 20+ clips & PDFs at once)",
            "1-click Download All (.zip) built purely offline in your browser",
            "Works across Windows, macOS, Linux & Chromebooks — 0 uploads",
            "Free single-file tier stays free forever with zero watermarks",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-slate-200">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {isPro ? (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="text-sm font-semibold text-emerald-200">
              Pro Lifetime Active ({activeKey})
            </div>
            <p className="mt-1 text-xs text-emerald-300/80">
              Batch queue compression and .zip archive export are unlocked on this device.
            </p>
            <button
              type="button"
              onClick={() => {
                onResetLicense();
                onClose();
              }}
              className="mt-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              Switch back to Free Tier
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <div>
              <label
                htmlFor="license-key-input"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-300"
              >
                <KeyRound className="h-3.5 w-3.5 text-teal-400" />
                Enter License Key (MVP Demo Key: <code>{DEMO_PRO_KEY}</code>)
              </label>
              <div className="flex gap-2">
                <input
                  id="license-key-input"
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="LOCAL-PRO-15"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-400"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
                >
                  Unlock Pro
                </button>
              </div>
              {error && (
                <p className="mt-1.5 text-xs text-rose-300">{error}</p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
