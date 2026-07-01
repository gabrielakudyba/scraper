import { extractCountryFromText, normalizeCountry } from "../countries.js";
import { extractDateRange } from "../dates.js";
import { normSpace } from "../extractors.js";

export function isTenTimesUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "10times.com";
  } catch {
    return false;
  }
}

function absUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}

function mapApiEvent(item, baseUrl) {
  const name = normSpace(item.name || item.title || item.event_name || item.eventName);
  if (!name) return null;

  const start = item.start_date || item.startDate || item.from_date || "";
  const end = item.end_date || item.endDate || item.to_date || "";
  const city = normSpace(item.city || item.venue_city || "");
  const country = normalizeCountry(item.country || item.country_name || item.venue_country || "");
  const venue = normSpace(
    item.venue || item.venue_name || [city, country].filter(Boolean).join(", ")
  );

  let detailUrl = item.url || item.event_url || item.link || "";
  if (detailUrl && !detailUrl.startsWith("http")) detailUrl = absUrl(detailUrl, baseUrl);

  const category = normSpace(
    Array.isArray(item.categories)
      ? item.categories.join(", ")
      : item.category || item.industry || item.event_type || ""
  );

  return {
    eventName: name,
    startDate: start ? String(start).slice(0, 10) : "",
    endDate: end ? String(end).slice(0, 10) : "",
    venue,
    country: country || extractCountryFromText(venue),
    category,
    previousEditions: normSpace(item.previous_editions || item.past_editions || ""),
    previousVenues: normSpace(item.previous_venues || ""),
    frequency: normSpace(item.frequency || item.recurrence || ""),
    detailUrl,
    sourceUrl: detailUrl || baseUrl,
    rawContext: normSpace(item.description || ""),
  };
}

function extractEventsFromApiPayload(json) {
  const results = [];
  const candidates = [
    json?.data?.events,
    json?.data?.results,
    json?.data?.list,
    json?.events,
    json?.results,
    json?.data,
  ];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const mapped = mapApiEvent(item, "https://10times.com");
      if (mapped) results.push(mapped);
    }
    if (results.length) break;
  }
  return results;
}

export function extractTenTimesFromApiCaptures(captures) {
  const events = [];
  for (const cap of captures || []) {
    events.push(...extractEventsFromApiPayload(cap.json));
  }
  return events;
}

export function extractTenTimesListing($, baseUrl) {
  const events = [];
  const seen = new Set();

  const cardSelectors = [
    "[class*='event-card']",
    "[class*='EventCard']",
    ".card",
    "article",
    "[data-event-id]",
    "li",
  ];

  for (const sel of cardSelectors) {
    $(sel).each((_, el) => {
      const block = $(el);
      const link = block.find("a[href*='10times.com']").first();
      if (!link.length) return;
      const href = link.attr("href") || "";
      if (!/10times\.com\/[a-z0-9-]+/i.test(href)) return;
      if (/\/(login|signup|about|contact|events$|tradeshows$)/i.test(href)) return;

      const detailUrl = absUrl(href, baseUrl);
      if (!detailUrl || seen.has(detailUrl)) return;

      const text = normSpace(block.text());
      if (text.length < 15 || text.length > 2000) return;

      const title =
        normSpace(link.attr("title") || link.text()) ||
        normSpace(block.find("h1,h2,h3,h4,[class*='title']").first().text());
      if (title.length < 4) return;

      const { startDate, endDate } = extractDateRange(text);
      const venue = normSpace(block.find("[class*='venue'],[class*='location'],address").first().text());
      const country = extractCountryFromText(text) || extractCountryFromText(venue);
      const category = normSpace(block.find("[class*='category'],[class*='industry'],.tag").first().text());

      seen.add(detailUrl);
      events.push({
        eventName: title,
        startDate,
        endDate,
        venue,
        country,
        category,
        detailUrl,
        rawContext: text.slice(0, 500),
      });
    });
    if (events.length >= 5) break;
  }

  if (events.length === 0) {
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!href.includes("10times.com/")) return;
      if (/\/(events|tradeshows|login|signup|about|city|country)(\/|$)/i.test(href)) return;
      const detailUrl = absUrl(href, baseUrl);
      const title = normSpace($(el).attr("title") || $(el).text());
      if (!detailUrl || title.length < 6 || title.length > 150 || seen.has(detailUrl)) return;
      if (!/[a-z]/i.test(title)) return;
      seen.add(detailUrl);
      events.push({
        eventName: title,
        startDate: "",
        endDate: "",
        venue: "",
        country: "",
        category: "",
        detailUrl,
        rawContext: title,
      });
    });
  }

  return events;
}

export function extractTenTimesDetail($, url) {
  const title =
    normSpace($("h1").first().text()) ||
    normSpace($('[class*="event-title"]').first().text()) ||
    normSpace($('meta[property="og:title"]').attr("content"));

  const pageText = normSpace($("body").text());
  const { startDate, endDate } = extractDateRange(pageText);

  const venue =
    normSpace($('[class*="venue"], [class*="location"], address').first().text()) ||
    normSpace($('meta[property="og:locality"]').attr("content"));

  const category = normSpace(
    $('[class*="category"], [class*="industry"], .breadcrumb').first().text()
  );

  return {
    eventName: title,
    startDate,
    endDate,
    venue,
    country: extractCountryFromText(pageText) || extractCountryFromText(venue),
    category: category.slice(0, 200),
    previousEditions: "",
    previousVenues: "",
    frequency: "",
    sourceUrl: url,
  };
}

export function getTenTimesNextPageUrl($, baseUrl) {
  const next =
    $('a[rel="next"]').attr("href") ||
    $("a")
      .filter((_, el) => /^(next|›|»)$/i.test(normSpace($(el).text())))
      .first()
      .attr("href");
  return next ? absUrl(next, baseUrl) : null;
}

export const tenTimesAdapter = {
  id: "10times",
  canHandle: isTenTimesUrl,
  needsBrowser: () => true,
  extractListing: extractTenTimesListing,
  extractDetail: extractTenTimesDetail,
  getNextPageUrl: getTenTimesNextPageUrl,
  extractFromApi: extractTenTimesFromApiCaptures,
};
