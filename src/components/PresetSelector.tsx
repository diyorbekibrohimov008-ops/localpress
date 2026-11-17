import { Mail, MessageSquare, Scale, Share2, SlidersHorizontal, VolumeX } from "lucide-react";
import { DESTINATION_PRESETS } from "../lib/presets";
import { describeTargetForecast } from "../lib/bitratePlanner";
import type { PresetId } from "../types/compression";

interface PresetSelectorProps {
  selectedPreset: PresetId;
  customMB: number;
  muteAudio: boolean;
  referenceOriginalBytes: number;
  onSelectPreset: (id: Exclude<PresetId, "custom">) => void;
  onChangeCustomMB: (mb: number) => void;
  onToggleMuteAudio: (muted: boolean) => void;
}

const PRESET_ICONS: Record<Exclude<PresetId, "custom">, typeof MessageSquare> = {
  discord: MessageSquare,
  email: Mail,
  court: Scale,
  slack: Share2,
};

export function PresetSelector({
  selectedPreset,
  customMB,
  muteAudio,
  referenceOriginalBytes,
  onSelectPreset,
  onChangeCustomMB,
  onToggleMuteAudio,
}: PresetSelectorProps) {
  const activeTargetMB =
    selectedPreset === "custom"
      ? customMB
      : DESTINATION_PRESETS.find((p) => p.id === selectedPreset)?.targetMB ?? customMB;

  const forecast = describeTargetForecast(activeTargetMB, referenceOriginalBytes);

  return (
    <section
      aria-label="Destination target presets"
      className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">
            1. Pick where your file needs to fit
          </h2>
          <p className="text-xs text-slate-400">
            No bitrate math or codec dials — pick a destination or drag the size target.
          </p>
        </div>
        <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-300">
          Target: &le; {activeTargetMB.toFixed(activeTargetMB < 5 ? 1 : 0)} MB
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DESTINATION_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset.id];
          const isSelected = selectedPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.id)}
              aria-pressed={isSelected}
              className={`group flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                isSelected
                  ? "border-teal-400 bg-teal-500/15 ring-2 ring-teal-400/25"
                  : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="mb-2 flex w-full items-center justify-between">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                    isSelected
                      ? "bg-teal-400 text-slate-950"
                      : "bg-slate-800 text-slate-300 group-hover:bg-slate-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                    isSelected
                      ? "bg-teal-400/20 text-teal-200"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {preset.limitLabel}
                </span>
              </div>
              <div className="text-sm font-semibold text-white">
                Make this fit {preset.label}
              </div>
              <div className="mt-1 text-xs text-slate-400">{preset.audienceTag}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="target-size-slider"
            className="flex items-center gap-2 text-xs font-medium text-slate-200"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-teal-400" />
            Target Size Slider
          </label>
          <span className="text-xs font-semibold text-teal-300">
            {activeTargetMB.toFixed(activeTargetMB < 5 ? 1 : 0)} MB max
          </span>
        </div>

        <input
          id="target-size-slider"
          type="range"
          min={0.5}
          max={100}
          step={0.5}
          value={activeTargetMB}
          onChange={(e) => onChangeCustomMB(Number(e.target.value))}
          className="target-slider w-full cursor-pointer"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>{forecast}</span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={muteAudio}
              onChange={(e) => onToggleMuteAudio(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-teal-400"
            />
            <VolumeX className="h-3.5 w-3.5 text-slate-400" />
            <span>Mute audio (sharper video)</span>
          </label>
        </div>
      </div>
    </section>
  );
}
