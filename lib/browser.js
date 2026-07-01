import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, "..", "..", ".browser-profile");

let persistentContext = null;

async function getPersistentContext() {
  if (persistentContext) return persistentContext;

  const headless = process.env.HEADLESS !== "false";
  const launchOpts = {
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  };

  try {
    persistentContext = await chromium.launchPersistentContext(PROFILE_DIR, {
      ...launchOpts,
      channel: "chrome",
    });
  } catch {
    persistentContext = await chromium.launchPersistentContext(PROFILE_DIR, launchOpts);
  }

  return persistentContext;
}

async function waitPastChallenge(page, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const title = await page.title();
    const bodyLen = await page.evaluate(() => document.body?.innerText?.length || 0);
    const blocked =
      /just a moment|security verification|performing security|cierpliwości|please enable cookies|you have been blocked/i.test(
        title + (await page.evaluate(() => document.body?.innerText?.slice(0, 500) || ""))
      );
    if (!blocked && bodyLen > 800) return true;
    await page.waitForTimeout(2000);
  }
  return false;
}

/**
 * @param {string} url
 * @param {{ onProgress?: (msg: object) => void, captureApi?: boolean }} [options]
 */
export async function fetchRenderedPage(url, options = {}) {
  const { onProgress = () => {}, captureApi = true } = options;
  const context = await getPersistentContext();
  const page = await context.newPage();

  const apiResponses = [];

  if (captureApi) {
    page.on("response", async (response) => {
      const respUrl = response.url();
      if (!/api\.10times\.com|10times\.com\/api/i.test(respUrl)) return;
      try {
        const json = await response.json();
        apiResponses.push({ url: respUrl, json });
      } catch {
        /* not JSON */
      }
    });
  }

  onProgress({ type: "browser", message: `Loading page in browser: ${url}` });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    const passed = await waitPastChallenge(page);
    if (!passed) {
      onProgress({
        type: "warn",
        message:
          "Cloudflare challenge not passed. Set HEADLESS=false, run again, and complete the verification in the browser window.",
      });
    } else {
      await page.waitForTimeout(2000);
      try {
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } catch {
        /* ok */
      }
    }

    const html = await page.content();
    return { html, apiResponses, cloudflareBlocked: !passed };
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (persistentContext) {
    await persistentContext.close();
    persistentContext = null;
  }
}
