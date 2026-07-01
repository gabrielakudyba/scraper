import { clocateAdapter } from "./clocate.js";
import { tenTimesAdapter } from "./tenTimes.js";

const adapters = [clocateAdapter, tenTimesAdapter];

export function getAdapterForUrl(url) {
  return adapters.find((a) => a.canHandle(url)) || null;
}

export function siteNeedsBrowser(url) {
  const adapter = getAdapterForUrl(url);
  if (adapter?.needsBrowser?.(url)) return true;
  try {
    const host = new URL(url).hostname;
    return host.includes("10times.com");
  } catch {
    return false;
  }
}

export { clocateAdapter, tenTimesAdapter };
