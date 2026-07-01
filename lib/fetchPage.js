import { fetchRenderedPage } from "./browser.js";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const FETCH_TIMEOUT_MS = 25000;

export async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error(`Not an HTML page: ${contentType}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} url
 * @param {{ useBrowser?: boolean, onProgress?: (msg: object) => void }} options
 */
export async function fetchPage(url, options = {}) {
  const { useBrowser = false, onProgress = () => {} } = options;

  if (useBrowser) {
    const result = await fetchRenderedPage(url, { onProgress, captureApi: true });
    return {
      html: result.html,
      apiCaptures: result.apiResponses,
      cloudflareBlocked: result.cloudflareBlocked,
      via: "browser",
    };
  }

  const html = await fetchHtml(url);
  return { html, apiCaptures: [], cloudflareBlocked: false, via: "http" };
}
