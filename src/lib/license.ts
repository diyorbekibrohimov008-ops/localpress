export interface LicenseState {
  isPro: boolean;
  licenseKey: string | null;
  activatedAt: string | null;
}

const STORAGE_KEY = "localpress_pro_license_v1";

export const DEMO_PRO_KEY = "LOCAL-PRO-15";

export function validateLicenseKey(rawKey: string): boolean {
  const normalized = rawKey.trim().toUpperCase();
  if (normalized === DEMO_PRO_KEY) return true;
  return /^LOCAL-PRO-[A-Z0-9]{4,12}(-[A-Z0-9]{4})?$/.test(normalized);
}

export function loadLicenseState(): LicenseState {
  if (typeof localStorage === "undefined") {
    return { isPro: false, licenseKey: null, activatedAt: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { isPro: false, licenseKey: null, activatedAt: null };
    const parsed = JSON.parse(raw) as Partial<LicenseState>;
    if (parsed.isPro && parsed.licenseKey && validateLicenseKey(parsed.licenseKey)) {
      return {
        isPro: true,
        licenseKey: parsed.licenseKey,
        activatedAt: parsed.activatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    // ignore corrupt storage
  }
  return { isPro: false, licenseKey: null, activatedAt: null };
}

export function activateProLicense(key: string): LicenseState {
  const normalized = key.trim().toUpperCase();
  if (!validateLicenseKey(normalized)) {
    throw new Error("Invalid license key. Try LOCAL-PRO-15 for the MVP demo unlock.");
  }
  const next: LicenseState = {
    isPro: true,
    licenseKey: normalized,
    activatedAt: new Date().toISOString(),
  };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function clearProLicense(): LicenseState {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  return { isPro: false, licenseKey: null, activatedAt: null };
}
