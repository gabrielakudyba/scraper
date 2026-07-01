import { extractCountryFromText, normalizeCountry } from "./countries.js";
import { extractDateRange, findAllYears, joinEditionDates } from "./dates.js";

export function normSpace(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function parseJsonLdScripts($) {
  const items = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const flatten = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) {
          obj.forEach(flatten);
          return;
        }
        if (obj["@graph"]) {
          flatten(obj["@graph"]);
          return;
        }
        const type = obj["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (types.some((t) => /Event|Exhibition|TradeShow|BusinessEvent/i.test(String(t)))) {
          items.push(obj);
        }
        if (obj.subEvent) flatten(obj.subEvent);
      };
      flatten(parsed);
    } catch {
      /* ignore invalid JSON-LD */
    }
  });
  return items;
}

function locationToString(loc) {
  if (!loc) return "";
  if (typeof loc === "string") return normSpace(loc);
  if (Array.isArray(loc)) return loc.map(locationToString).filter(Boolean).join("; ");
  const parts = [];
  if (loc.name) parts.push(loc.name);
  const addr = loc.address;
  if (typeof addr === "string") parts.push(addr);
  else if (addr) {
    ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"].forEach((k) => {
      if (addr[k]) parts.push(typeof addr[k] === "string" ? addr[k] : addr[k].name || "");
    });
  }
  return normSpace(parts.join(", "));
}

function eventFromJsonLd(item) {
  const loc = locationToString(item.location);
  const country =
    extractCountryFromText(loc) ||
    (item.location?.address?.addressCountry
      ? normalizeCountry(
          typeof item.location.address.addressCountry === "string"
            ? item.location.address.addressCountry
            : item.location.address.addressCountry.name
        )
      : "");

  const start = item.startDate ? String(item.startDate).slice(0, 10) : "";
  const end = item.endDate ? String(item.endDate).slice(0, 10) : start;

  return {
    eventName: normSpace(item.name),
    startDate: start,
    endDate: end,
    venue: loc,
    country,
    category: normSpace(item.eventAttendanceMode || item.eventStatus || item.category || ""),
    sourceUrl: item.url || item.sameAs || "",
  };
}

const EVENT_LINK_HINTS =
  /event|exhibition|fair|trade|show|messe|expo|congress|conference|targi|ausstellung/i;

const SKIP_LINK_HINTS =
  /login|register|signup|cart|privacy|cookie|terms|contact|about|news|blog|javascript:|#$/i;

export function discoverEventLinks($, baseUrl) {
  const base = new URL(baseUrl);
  const seen = new Set();
  const links = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || SKIP_LINK_HINTS.test(href)) return;
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      return;
    }
    if (!abs.startsWith("http")) return;
    if (seen.has(abs)) return;

    const text = normSpace($(el).text());
    const ctx = normSpace($(el).closest("article, .event, .card, li, tr, [class*='event']").text()).slice(0, 300);
    const score =
      (EVENT_LINK_HINTS.test(abs) ? 2 : 0) +
      (EVENT_LINK_HINTS.test(text) ? 2 : 0) +
      (text.length > 5 && text.length < 120 ? 1 : 0) +
      (/\d{4}/.test(ctx) ? 1 : 0);

    if (score >= 2) {
      seen.add(abs);
      links.push({ url: abs, title: text || "", context: ctx });
    }
  });

  return links.sort((a, b) => b.url.length - a.url.length).slice(0, 200);
}

export function extractListingCards($, baseUrl) {
  const events = [];
  const selectors = [
    "article",
    "[class*='event']",
    "[class*='exhibition']",
    "[class*='fair']",
    "[class*='trade-show']",
    "[itemtype*='Event']",
    ".card",
    "tr",
    "li",
  ];

  const seen = new Set();
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const block = $(el);
      if (sel === "tr" && block.closest("table").length) return;
      const text = normSpace(block.text());
      if (text.length < 20 || text.length > 3000) return;

      const linkEl = block.find("a[href]").filter((__, a) => {
        const t = normSpace($(a).text());
        return t.length > 3 && t.length < 150;
      }).first();
      const href = linkEl.attr("href");
      let url = "";
      if (href) {
        try {
          url = new URL(href, baseUrl).href;
        } catch {
          /* ignore */
        }
      }

      const key = url || text.slice(0, 80);
      if (seen.has(key)) return;
      seen.add(key);

      const title =
        normSpace(linkEl.text()) ||
        normSpace(block.find("h1,h2,h3,h4,.title,[class*='title']").first().text()) ||
        text.slice(0, 100);

      if (title.length < 3) return;

      const { startDate, endDate } = extractDateRange(text);
      const venue =
        normSpace(block.find("[class*='venue'],[class*='location'],address,.place").first().text()) ||
        "";
      const country = extractCountryFromText(text) || extractCountryFromText(venue);
      const category =
        normSpace(block.find("[class*='category'],[class*='sector'],[class*='industry'],.tag,.badge").first().text()) ||
        "";

      events.push({
        eventName: title,
        startDate,
        endDate,
        venue,
        country,
        category,
        detailUrl: url,
        rawContext: text.slice(0, 500),
      });
    });
  }
  return events;
}

export function extractPreviousEditions(text) {
  if (!text) return { editions: "", venues: "" };

  const editionBlocks = [];
  const patterns = [
    /(?:previous|past|earlier|former)\s+editions?[:\s]+([^.]{10,400})/gi,
    /(?:edition|year)\s*(?:history|archive)[:\s]+([^.]{10,400})/gi,
    /(?:held|took place)\s+(?:in|at)\s+([^.]{10,200})/gi,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      editionBlocks.push(m[1]);
    }
  }

  const years = findAllYears(text);
  const yearLines = years.slice(0, 15).map((y) => String(y));

  const venueMatches = [...text.matchAll(/(?:at|in)\s+([A-Z][^.!?\n]{5,80}(?:Center|Centre|Hall|Arena|Expo|Fair))/gi)]
    .map((m) => normSpace(m[1]))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 10);

  const editions =
    editionBlocks.length > 0
      ? joinEditionDates(editionBlocks)
      : yearLines.length > 1
        ? yearLines.join(", ")
        : "";

  return {
    editions,
    venues: venueMatches.join("; "),
  };
}

export function extractFrequency(text) {
  if (!text) return "";
  const low = text.toLowerCase();
  const rules = [
    { re: /\b(annual(?:ly)?|every year|once a year|yearly)\b/i, out: "Annual" },
    { re: /\b(biennial(?:ly)?|every two years|every 2 years|biannual)\b/i, out: "Biennial (every 2 years)" },
    { re: /\b(triennial(?:ly)?|every three years|every 3 years)\b/i, out: "Triennial (every 3 years)" },
    { re: /\b(quarterly|every quarter|four times a year)\b/i, out: "Quarterly" },
    { re: /\b(monthly|every month)\b/i, out: "Monthly" },
    { re: /\b(weekly|every week)\b/i, out: "Weekly" },
    { re: /\b(semi-?annual|twice a year|two times a year|biannual)\b/i, out: "Semi-annual (twice a year)" },
  ];
  for (const { re, out } of rules) {
    if (re.test(low)) return out;
  }
  const everyN = /\bevery\s+(\d+)\s+years?\b/i.exec(low);
  if (everyN) return `Every ${everyN[1]} years`;
  return "";
}

export function extractCategory($, text) {
  let fromMeta = "";
  let breadcrumbs = "";
  let tags = "";

  if (typeof $ === "function") {
    fromMeta =
      $('meta[property="article:section"]').attr("content") ||
      $('meta[name="keywords"]').attr("content") ||
      "";
    breadcrumbs = normSpace($("[class*='breadcrumb'], nav[aria-label*='breadcrumb']").text());
    tags = normSpace($("[class*='tag'],[class*='category'],[class*='sector']").text());
  }

  const candidates = [fromMeta, breadcrumbs, tags, text].map(normSpace).filter(Boolean);
  for (const c of candidates) {
    if (c.length > 3 && c.length < 200) return c.split(/[,|]/)[0].trim();
  }
  return "";
}

export function mergeEventData(base, detail, pageText) {
  const text = [base.rawContext, pageText, detail?.text].filter(Boolean).join("\n");
  const dates = extractDateRange(text);
  const prev = extractPreviousEditions(text);
  const freq = extractFrequency(text);

  return {
    country: base.country || detail?.country || extractCountryFromText(text) || "",
    eventName: base.eventName || detail?.eventName || "",
    startDate: base.startDate || detail?.startDate || dates.startDate || "",
    endDate: base.endDate || detail?.endDate || dates.endDate || "",
    venue: base.venue || detail?.venue || "",
    category: base.category || detail?.category || extractCategory(detail?.$ || { text: "" }, text) || "",
    previousEditions: prev.editions,
    previousVenues: prev.venues,
    frequency: freq,
    sourceUrl: base.detailUrl || detail?.sourceUrl || "",
  };
}

export function extractFromPage($, url) {
  const jsonLdEvents = parseJsonLdScripts($).map(eventFromJsonLd);
  if (jsonLdEvents.length > 0) {
    return jsonLdEvents.map((e) => ({
      ...e,
      sourceUrl: e.sourceUrl || url,
      detailUrl: url,
    }));
  }

  const title =
    normSpace($("h1").first().text()) ||
    normSpace($('meta[property="og:title"]').attr("content")) ||
    normSpace($("title").text());

  const pageText = normSpace($("body").text());
  const dates = extractDateRange(pageText);
  const venue =
    normSpace($("[class*='venue'],[class*='location'],address,.place,[itemprop='location']").first().text()) ||
    normSpace($('[itemprop="location"]').text());

  return [
    {
      eventName: title,
      startDate: dates.startDate,
      endDate: dates.endDate,
      venue,
      country: extractCountryFromText(pageText) || extractCountryFromText(venue),
      category: extractCategory($, pageText),
      detailUrl: url,
      rawContext: pageText.slice(0, 800),
    },
  ];
}

export function extractTables($, baseUrl) {
  const events = [];
  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    if (rows.length < 2) return;
    const headers = [];
    rows.first().find("th,td").each((__, cell) => headers.push(normSpace($(cell).text()).toLowerCase()));

    const nameIdx = headers.findIndex((h) => /name|event|exhibition|fair|title/.test(h));
    const dateIdx = headers.findIndex((h) => /date|when|termin/.test(h));
    const locIdx = headers.findIndex((h) => /location|venue|place|city|country/.test(h));
    const catIdx = headers.findIndex((h) => /category|sector|industry|type/.test(h));

    if (nameIdx === -1 && dateIdx === -1) return;

    rows.slice(1).each((__, row) => {
      const cells = [];
      $(row).find("td").each((___, c) => cells.push(normSpace($(c).text())));
      if (!cells.length) return;

      const name = nameIdx >= 0 ? cells[nameIdx] : cells[0];
      if (!name || /^(event|name|title|fair|exhibition)\b/i.test(name) && cells.length <= 4 && /date|location|category/i.test(cells.join(" "))) return;

      const dateText = dateIdx >= 0 ? cells[dateIdx] : cells.join(" ");
      const { startDate, endDate } = extractDateRange(dateText);
      const loc = locIdx >= 0 ? cells[locIdx] : "";
      const link = $(row).find("a[href]").first().attr("href");
      let detailUrl = "";
      if (link) {
        try {
          detailUrl = new URL(link, baseUrl).href;
        } catch {
          /* ignore */
        }
      }

      events.push({
        eventName: name,
        startDate,
        endDate,
        venue: loc,
        country: extractCountryFromText(loc),
        category: catIdx >= 0 ? cells[catIdx] : "",
        detailUrl,
        rawContext: cells.join(" | "),
      });
    });
  });
  return events;
}
