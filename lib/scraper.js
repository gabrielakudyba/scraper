import * as cheerio from "cheerio";
import {
  discoverEventLinks,
  extractFromPage,
  extractListingCards,
  extractTables,
  mergeEventData,
  normSpace,
} from "./extractors.js";
import { extractDateRange } from "./dates.js";
import { extractCountryFromText } from "./countries.js";
import { extractFrequency, extractPreviousEditions } from "./extractors.js";
import { fetchPage } from "./fetchPage.js";
import { getAdapterForUrl, siteNeedsBrowser } from "./adapters/index.js";
import { isClocateDetailUrl } from "./adapters/clocate.js";

function dedupeEvents(events) {
  const map = new Map();
  for (const e of events) {
    const name = normSpace(e.eventName).toLowerCase();
    if (!name || name.length < 3) continue;
    if (/^(event name|name|title|date|location|category)$/i.test(name)) continue;
    const key = name + "|" + (e.startDate || "") + "|" + normSpace(e.venue).toLowerCase();
    const existing = map.get(key);
    if (!existing || scoreEvent(e) > scoreEvent(existing)) {
      map.set(key, e);
    }
  }
  return [...map.values()].filter((e) => e.eventName && e.eventName.length > 2);
}

function scoreEvent(e) {
  return (
    (e.startDate ? 2 : 0) +
    (e.country ? 1 : 0) +
    (e.venue ? 1 : 0) +
    (e.category ? 1 : 0) +
    (e.frequency ? 1 : 0) +
    (e.previousEditions ? 1 : 0)
  );
}

function finalizeRow(row) {
  const text = [row.eventName, row.venue, row.category, row.previousEditions, row.previousVenues].join(" ");

  if (!row.country) row.country = extractCountryFromText(text);
  if (!row.startDate && !row.endDate) {
    const d = extractDateRange(text);
    row.startDate = d.startDate;
    row.endDate = d.endDate;
  }
  if (!row.previousEditions) {
    const prev = extractPreviousEditions(text);
    row.previousEditions = prev.editions;
    if (!row.previousVenues) row.previousVenues = prev.venues;
  }
  if (!row.frequency) row.frequency = extractFrequency(text);

  return {
    country: row.country || "",
    eventName: row.eventName || "",
    startDate: row.startDate || "",
    endDate: row.endDate || "",
    venue: row.venue || "",
    category: row.category || "",
    previousEditions: row.previousEditions || "",
    previousVenues: row.previousVenues || "",
    frequency: row.frequency || "",
    sourceUrl: row.sourceUrl || "",
  };
}

function findGenericNextPageUrl($, baseUrl) {
  const relNext = $('a[rel="next"], link[rel="next"]').attr("href");
  if (relNext) {
    try {
      return new URL(relNext, baseUrl).href;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function extractListing($, pageUrl, adapter) {
  if (adapter) {
    return adapter.extractListing($, pageUrl);
  }
  const fromTables = extractTables($, pageUrl);
  const fromCards = extractListingCards($, pageUrl);
  const fromPage = extractFromPage($, pageUrl);
  return dedupeEvents([...fromTables, ...fromCards, ...fromPage]);
}

function extractDetail($, pageUrl, adapter) {
  if (adapter?.extractDetail) {
    return adapter.extractDetail($, pageUrl);
  }
  const detailEvents = extractFromPage($, pageUrl);
  const detail = detailEvents[0] || {};
  const pageText = normSpace($("body").text());
  return { ...detail, $, text: pageText };
}

const SAFETY_MAX_PAGES = 500;
const SAFETY_MAX_EVENTS = 10000;

/**
 * @param {object} options
 */
export async function scrapeTradeFairs(options) {
  const {
    url,
    maxEvents = 50,
    maxPages = 5,
    scrapeAllPages = false,
    followDetails = true,
    useBrowser = null,
    onProgress = () => {},
  } = options;

  const adapter = getAdapterForUrl(url);
  const browserMode = useBrowser ?? siteNeedsBrowser(url);
  const eventLimit = scrapeAllPages ? SAFETY_MAX_EVENTS : maxEvents;
  const pageLimit = scrapeAllPages ? SAFETY_MAX_PAGES : maxPages;

  onProgress({
    type: "start",
    message: `Starting crawl of ${url}${adapter ? ` [${adapter.id} adapter]` : ""}${browserMode ? " (browser mode)" : ""}${scrapeAllPages ? " (all pages)" : ""}`,
    url,
  });

  if (adapter?.id === "clocate" && isClocateDetailUrl(url)) {
    onProgress({ type: "page", message: "Single Clocate event detail page", url });
    const fetched = await fetchPage(url, { useBrowser: browserMode, onProgress });
    const $ = cheerio.load(fetched.html);
    const detail = adapter.extractDetail($, url);
    const results = [finalizeRow(detail)];
    onProgress({ type: "done", message: `Extracted 1 event from detail page`, count: 1 });
    return {
      sourceUrl: url,
      adapter: adapter.id,
      browserMode,
      scrapedAt: new Date().toISOString(),
      pagesScraped: 1,
      eventCount: 1,
      events: results,
    };
  }

  const visitedPages = new Set();
  const visitedDetails = new Set();
  const detailCache = new Map();
  const listingCandidates = [];
  let queue = [url];
  let pagesScraped = 0;

  while (queue.length > 0 && pagesScraped < pageLimit) {
    const pageUrl = queue.shift();
    if (visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);
    pagesScraped += 1;

    const pageLabel = scrapeAllPages ? `${pagesScraped}` : `${pagesScraped}/${pageLimit}`;
    onProgress({
      type: "page",
      message: `Fetching listing page ${pageLabel}`,
      url: pageUrl,
      found: listingCandidates.length,
    });

    let html;
    let apiCaptures = [];
    try {
      const fetched = await fetchPage(pageUrl, { useBrowser: browserMode, onProgress });
      html = fetched.html;
      apiCaptures = fetched.apiCaptures || [];

      if (fetched.cloudflareBlocked && collected.length === 0 && pagesScraped === 1) {
        onProgress({
          type: "warn",
          message:
            "Site is protected by Cloudflare. Start the server with HEADLESS=false, complete verification in the browser window, then scrape again.",
        });
      }
    } catch (err) {
      onProgress({ type: "warn", message: `Failed to fetch ${pageUrl}: ${err.message}` });
      continue;
    }

    const $ = cheerio.load(html);

    let candidates = [];

    if (adapter?.extractFromApi && apiCaptures.length > 0) {
      candidates = dedupeEvents(adapter.extractFromApi(apiCaptures));
      onProgress({ type: "info", message: `Extracted ${candidates.length} events from API responses` });
    }

    if (candidates.length === 0) {
      candidates = dedupeEvents(extractListing($, pageUrl, adapter));
    }

    onProgress({
      type: "info",
      message: `Found ${candidates.length} candidate events on page`,
      url: pageUrl,
    });

    if (candidates.length === 0) {
      const links = discoverEventLinks($, pageUrl).slice(0, scrapeAllPages ? 500 : eventLimit);
      candidates = links.map((l) => ({
        eventName: l.title || "Unknown event",
        startDate: "",
        endDate: "",
        venue: "",
        country: "",
        category: "",
        detailUrl: l.url,
        rawContext: l.context,
      }));
    }

    listingCandidates.push(...candidates);

    const nextPage = adapter?.getNextPageUrl
      ? adapter.getNextPageUrl($, pageUrl)
      : findGenericNextPageUrl($, pageUrl);

    if (nextPage && !visitedPages.has(nextPage) && !queue.includes(nextPage)) {
      queue.push(nextPage);
    } else if (scrapeAllPages && !nextPage) {
      onProgress({ type: "info", message: "No more listing pages — pagination finished" });
    }
  }

  let toProcess = dedupeEvents(listingCandidates);
  if (!scrapeAllPages) {
    toProcess = toProcess.slice(0, eventLimit);
  } else if (toProcess.length > eventLimit) {
    onProgress({ type: "warn", message: `Hit safety cap of ${eventLimit} events` });
    toProcess = toProcess.slice(0, eventLimit);
  }

  onProgress({
    type: "info",
    message: `Processing ${toProcess.length} events from ${pagesScraped} page(s)`,
  });

  const collected = [];

  for (const candidate of toProcess) {
    if (collected.length >= eventLimit) break;

    let merged = {
      country: candidate.country || "",
      eventName: candidate.eventName || "",
      startDate: candidate.startDate || "",
      endDate: candidate.endDate || "",
      venue: candidate.venue || "",
      category: candidate.category || "",
      previousEditions: candidate.previousEditions || "",
      previousVenues: candidate.previousVenues || "",
      frequency: candidate.frequency || "",
      sourceUrl: candidate.detailUrl || candidate.sourceUrl || url,
    };

    const needsDetail =
      followDetails &&
      candidate.detailUrl &&
      (!merged.startDate || !merged.country || !merged.category || adapter?.id === "clocate");

    if (needsDetail && candidate.detailUrl) {
      const detailUrl = candidate.detailUrl;

      if (detailCache.has(detailUrl)) {
        Object.assign(merged, detailCache.get(detailUrl));
      } else if (!visitedDetails.has(detailUrl)) {
        visitedDetails.add(detailUrl);
        onProgress({
          type: "detail",
          message: `Fetching details: ${candidate.eventName}`,
          url: detailUrl,
          found: collected.length,
        });

        try {
          const fetched = await fetchPage(detailUrl, { useBrowser: browserMode, onProgress });
          const $d = cheerio.load(fetched.html);
          const detail = extractDetail($d, detailUrl, adapter);

          if (adapter?.id === "clocate") {
            merged = { ...merged, ...detail, sourceUrl: detailUrl };
          } else {
            merged = mergeEventData(candidate, detail, detail.text || "");
            merged.sourceUrl = detailUrl;
          }
          detailCache.set(detailUrl, merged);
        } catch (err) {
          onProgress({ type: "warn", message: `Detail fetch failed: ${err.message}` });
        }

        await sleep(adapter?.id === "clocate" ? 200 : 400);
      }
    }

    collected.push(finalizeRow(merged));
    onProgress({
      type: "event",
      message: `Extracted: ${merged.eventName}`,
      found: collected.length,
      total: toProcess.length,
    });
  }

  const results = dedupeEvents(collected).slice(0, eventLimit).map(finalizeRow);

  onProgress({
    type: "done",
    message: `Crawl complete — ${results.length} events extracted`,
    count: results.length,
  });

  return {
    sourceUrl: url,
    adapter: adapter?.id || "generic",
    browserMode,
    scrapeAllPages,
    scrapedAt: new Date().toISOString(),
    pagesScraped,
    eventCount: results.length,
    events: results,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
