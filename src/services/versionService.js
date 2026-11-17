import { buildApiUrl } from "../config/apiConfig";

const CACHE_KEY = "fossiles.backVersion";
const FETCH_TIMEOUT_MS = 3000;

let memoryCache;
let inFlight;

export function resetVersionCache() {
  memoryCache = undefined;
  inFlight = undefined;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore quota / private-mode failures
  }
}

export function getFrontVersion() {
  const raw = process.env.REACT_APP_VERSION;
  if (raw == null || String(raw).trim() === "") return "dev";
  return String(raw).trim().replace(/^v/i, "");
}

export function getFrontCommit() {
  const raw = process.env.REACT_APP_COMMIT;
  if (raw == null || String(raw).trim() === "") return "unknown";
  return String(raw).trim();
}

export function formatVersion(version) {
  const stripped = String(version || "dev").trim().replace(/^v/i, "");
  if (!stripped || stripped.toLowerCase() === "dev") return "dev";
  return `v${stripped}`;
}

function readSessionCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.version === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function getCachedBackVersion() {
  if (memoryCache !== undefined) return memoryCache;
  const cached = readSessionCache();
  if (cached) memoryCache = cached;
  return cached;
}

function storeCache(data) {
  memoryCache = data;
  if (!data) return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota / private-mode failures
  }
}

function usableBackVersion(data) {
  if (!data || typeof data.version !== "string" || !data.version.trim()) return null;
  return {
    version: data.version.trim().replace(/^v/i, ""),
    commit: data.commit ? String(data.commit) : "",
    buildTime: data.buildTime ? String(data.buildTime) : "",
  };
}

export function fetchBackVersion() {
  const cached = getCachedBackVersion();
  if (cached !== undefined) return Promise.resolve(cached);

  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(buildApiUrl("/public/version"), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        storeCache(null);
        return null;
      }
      const data = usableBackVersion(await response.json());
      storeCache(data);
      return data;
    } catch {
      storeCache(null);
      return null;
    } finally {
      clearTimeout(timer);
      inFlight = undefined;
    }
  })();

  return inFlight;
}
