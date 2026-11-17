import { useRef, useState } from "react";
import { FileText, Film, Image as ImageIcon, ShieldCheck, UploadCloud } from "lucide-react";

interface DropzoneCardProps {
  onFilesSelected: (files: File[]) => void;
  onGenerateSamplePdf: () => void;
  onGenerateSampleVideo: () => void;
  sampleBusy: "pdf" | "video" | null;
}

export function DropzoneCard({
  onFilesSelected,
  onGenerateSamplePdf,
  onGenerateSampleVideo,
  sampleBusy,
}: DropzoneCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  };

  return (
    <section
      aria-label="Local file dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-7 text-center transition ${
        dragging
          ? "border-teal-400 bg-teal-500/10"
          : "border-slate-700/80 bg-slate-900/50 hover:border-slate-600"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.pdf,application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        data-testid="file-input"
      />

      <div className="mx-auto flex max-w-xl flex-col items-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-300">
          <UploadCloud className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-white">
          2. Drop videos, legal PDFs, or images here
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Everything runs inside your browser&apos;s WebAssembly sandbox. Files never touch a cloud server.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1">
            <Film className="h-3.5 w-3.5 text-sky-400" />
            MP4 / MOV / WebM / MKV
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1">
            <FileText className="h-3.5 w-3.5 text-amber-400" />
            Legal &amp; Scanned PDFs
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1">
            <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
            JPG / PNG / WebP
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-teal-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-300"
          >
            Choose Local File(s)
          </button>

          <button
            type="button"
            onClick={onGenerateSamplePdf}
            disabled={sampleBusy !== null}
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
          >
            {sampleBusy === "pdf"
              ? "Building sample PDF..."
              : "Try Sample Legal PDF (~3 MB)"}
          </button>

          <button
            type="button"
            onClick={onGenerateSampleVideo}
            disabled={sampleBusy !== null}
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
          >
            {sampleBusy === "video"
              ? "Rendering 3s demo clip..."
              : "Try Sample Video (~3.6 MB)"}
          </button>
        </div>

        <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-emerald-300/90">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>100% client-side • Windows, macOS &amp; Chromebook • Offline-capable</span>
        </div>
      </div>
    </section>
  );
}
