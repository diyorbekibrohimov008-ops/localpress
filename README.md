# LocalPress — Zero-Cloud WebAssembly File & Video Compression

100% client-side local video, PDF, and image compression in your browser via WebAssembly — **zero file uploads**, working across Windows, macOS, and Chromebooks.

## Key Features
- **Zero-Cloud Privacy**: Files never leave browser memory. Verified `0 B uploaded` live fetch guard + `COOP`/`COEP` (`credentialless`) cross-origin isolation for multi-threaded `SharedArrayBuffer` Wasm.
- **Destination Presets (No Bitrate Dials)**:
  - **Discord (25 MB)** (`24.3 MB` safe target)
  - **Email (20 MB)** (`19.3 MB` safe target)
  - **Court Portal (2 MB)** (`1.9 MB` strict target)
  - **Slack / Teams (10 MB)** (`9.6 MB` safe target)
  - Custom **Target Size Slider** (`0.5 MB – 100 MB`) + optional audio mute toggle
- **Real In-Browser Compression Engines**:
  - **Video**: `@ffmpeg/ffmpeg` Wasm (multi-threaded `@ffmpeg/core-mt` when `crossOriginIsolated`, single-threaded fallback otherwise, plus built-in browser `MediaRecorder` hardware codec fallback if offline/CDN blocked).
  - **PDF**: Pure-TypeScript structural PDF parser + embedded JPEG recompression + native `FlateDecode` stream compression preserving selectable legal text, with adaptive raster fallback when needed.
  - **Images**: Canvas binary-search target-size compressor.
- **Free Tier & $15 Lifetime Batch Mode**: Unlimited free 1-by-1 compression; Pro batch queue + pure-TS `.zip` archive download (`LOCAL-PRO-15` demo key included).

## Local Development & Verification

```bash
npm install
npm run typecheck
npm test
npm run build
npm run preview
```

## Deploy (Netlify / Vercel)

`netlify.toml`, `public/_headers`, `public/_redirects`, and `vercel.json` are pre-configured with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` for `SharedArrayBuffer` Wasm support.

- **Netlify Drag & Drop (zero CLI):** Build with `npm run build` and drop the `dist/` folder at `https://app.netlify.com/drop`.
- **Netlify CLI:** `npx netlify-cli deploy --prod --dir=dist`
- **Vercel CLI:** `npx vercel --prod`
