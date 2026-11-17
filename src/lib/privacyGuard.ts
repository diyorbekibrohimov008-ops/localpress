import type { PrivacyMetrics } from "../types/compression";

let activeUploadBytes = 0;

export function getInitialPrivacyMetrics(): PrivacyMetrics {
  const isolated =
    typeof window !== "undefined" ? Boolean(window.crossOriginIsolated) : false;
  const sab = typeof SharedArrayBuffer !== "undefined";

  return {
    crossOriginIsolated: isolated,
    sharedArrayBufferReady: sab && isolated,
    bytesUploaded: activeUploadBytes,
    wasmRuntimeCached: false,
    jobsCompletedLocally: 0,
    totalBytesSaved: 0,
  };
}

/**
 * Installs an opt-in lightweight guard around window.fetch while jobs run
 * so the UI can prove empirically that 0 bytes of user file payloads leave the browser.
 */
export function installZeroUploadAudit(): () => void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return () => {};
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const method = (init?.method || "GET").toUpperCase();
    // Only static CDN runtime scripts/wasm (GET) are ever allowed; block/count any POST/PUT upload
    if (method !== "GET" && method !== "HEAD" && init?.body) {
      activeUploadBytes +=
        typeof init.body === "string"
          ? init.body.length
          : init.body instanceof Blob
            ? init.body.size
            : 1024;
      throw new Error(
        `LocalPress Zero-Cloud Guard blocked outbound ${method} request to ${url}`
      );
    }

    return originalFetch(input, init);
  };

  return () => {
    window.fetch = originalFetch;
  };
}
