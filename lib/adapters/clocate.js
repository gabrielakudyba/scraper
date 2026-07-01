import { extractDateRange, findAllYears, joinEditionDates } from "../dates.js";
import { extractCountryFromText, normalizeCountry } from "../countries.js";
import { normSpace } from "../extractors.js";

const MONTHS =
  "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December";

const CLOLOCATE_EVENT_PATH = /^\/[a-z0-9][a-z0-9-]*\/\d+\/?$/i;

export function isClocateUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "clocate.com";
  } catch {
    return false;
  }
}

export function isClocateEventPath(pathname) {
  if (!CLOLOCATE_EVENT_PATH.test(pathname)) return false;
  if (pathname.startsWith("/article/")) return false;
  if (pathname.includes("+")) return false;
  return true;
}

export function isClocateDetailUrl(url) {
  try {
    return isClocateEventPath(new URL(url).pathname);
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

function parseClocateDateText(text) {
  if (!text) return { startDate: "", endDate: "" };

  const rangeNamed = new RegExp(
    `(\\d{1,2})\\s*(${MONTHS})\\s*-\\s*(\\d{1,2})\\s*(${MONTHS}),?\\s+(\\d{4})`,
    "i"
  ).exec(text);
  if (rangeNamed) {
    return extractDateRange(
      `${rangeNamed[1]} ${rangeNamed[2]} ${rangeNamed[5]} - ${rangeNamed[3]} ${rangeNamed[4]} ${rangeNamed[5]}`
    );
  }

  const dashRange = new RegExp(`(\\d{1,2})-(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, "i").exec(text);
  if (dashRange) {
    return extractDateRange(`${dashRange[1]} ${dashRange[3]} ${dashRange[4]} - ${dashRange[2]} ${dashRange[3]} ${dashRange[4]}`);
  }

  const compact = /^(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d{4})$/i.exec(text.replace(/\s+/g, ""));
  if (compact) {
    return extractDateRange(`${compact[1]} ${compact[2]} ${compact[3]}`);
  }

  return extractDateRange(text);
}

function parseLocationLine(text) {
  const line = normSpace(text);
  if (!line) return { venue: "", country: "" };
  const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const country = normalizeCountry(parts[parts.length - 1]);
    const city = parts[parts.length - 2];
    return { venue: line, country, city };
  }
  return { venue: line, country: extractCountryFromText(line) };
}

function inferFrequencyFromEditions(editionLines, eventName) {
  const years = [];
  for (const line of editionLines) {
    const m = line.match(/\b(19|20)\d{2}\b/g);
    if (m) years.push(...m.map(Number));
  }
  const uniq = [...new Set(years)].sort((a, b) => a - b);
  if (uniq.length >= 2) {
    const gaps = [];
    for (let i = 1; i < uniq.length; i++) gaps.push(uniq[i] - uniq[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avg >= 1.5 && avg <= 2.5) return "Biennial (every 2 years)";
    if (avg >= 0.8 && avg <= 1.2) return "Annual";
    if (avg > 2.5) return `Every ~${Math.round(avg)} years`;
  }
  if (/\bannual\b/i.test(eventName)) return "Annual";
  if (/\bbiennial\b/i.test(eventName)) return "Biennial (every 2 years)";
  return "";
}

function parseJsonLdEvents($) {
  const events = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || "[]");
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!/Event/i.test(String(item["@type"] || ""))) continue;
        const loc = item.location;
        let venue = "";
        let country = "";
        if (loc) {
          if (typeof loc === "string") venue = loc;
          else {
            venue = [loc.name, loc.address?.streetAddress, loc.address?.addressLocality]
              .filter(Boolean)
              .join(", ");
            country = normalizeCountry(loc.address?.addressCountry || "");
          }
        }
        events.push({
          eventName: normSpace(item.name),
          startDate: item.startDate ? String(item.startDate).slice(0, 10) : "",
          endDate: item.endDate ? String(item.endDate).slice(0, 10) : "",
          venue,
          country,
        });
      }
    } catch {
      /* ignore */
    }
  });
  return events;
}

export function extractClocateListing($, baseUrl) {
  const events = [];
  const seen = new Set();

  $(".card.getresults-item, .card.getresults-promoted").each((_, card) => {
    const block = $(card);
    const link = block.find("h2 a").first();
    const href = link.attr("href") || "";
    if (!isClocateEventPath(href.split("?")[0])) return;

    const detailUrl = absUrl(href, baseUrl);
    if (!detailUrl || seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const eventName = normSpace(link.attr("title") || link.text());
    const metaCol = block.find(".col.min-w-0").first();
    const lines = metaCol
      .children("div")
      .map((__, el) => normSpace($(el).text()))
      .get()
      .filter(Boolean);

    const dateText = lines[0] || "";
    const locationText = lines[1] || "";
    const { startDate, endDate } = parseClocateDateText(dateText);
    const loc = parseLocationLine(locationText);

    events.push({
      eventName,
      startDate,
      endDate,
      venue: loc.venue,
      country: loc.country,
      category: "",
      detailUrl,
      rawContext: [eventName, dateText, locationText].join(" | "),
    });
  });

  if (events.length === 0) {
    const byHref = new Map();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const path = href.split("?")[0];
      if (!isClocateEventPath(path)) return;
      const detailUrl = absUrl(href, baseUrl);
      const text = normSpace($(el).attr("title") || $(el).text());
      if (!detailUrl || text.length < 8) return;
      if (!byHref.has(detailUrl)) byHref.set(detailUrl, []);
      byHref.get(detailUrl).push(text);
    });

    for (const [detailUrl, texts] of byHref) {
      if (seen.has(detailUrl)) continue;
      const title = texts.find((t) => t.length > 20 && !/^\d/.test(t)) || texts[0];
      const meta = texts.find((t) => /\d{4}/.test(t) && t !== title) || "";
      const { startDate, endDate } = parseClocateDateText(meta);
      const loc = parseLocationLine(meta.replace(/\d{1,2}.*\d{4}/, "").trim());
      events.push({
        eventName: title,
        startDate,
        endDate,
        venue: loc.venue,
        country: loc.country,
        category: "",
        detailUrl,
        rawContext: texts.join(" | "),
      });
      seen.add(detailUrl);
    }
  }

  return events;
}

export function extractClocateDetail($, url) {
  const jsonLd = parseJsonLdEvents($)[0] || {};
  const eventName = normSpace($("h1.conf-hdr-sm").first().text()) || jsonLd.eventName || normSpace($("h1").first().text());

  const metaTexts = [];
  $(".conf-hero-meta__text").each((_, el) => metaTexts.push(normSpace($(el).text())));

  const dateText = metaTexts[0] || "";
  const heroLocation = metaTexts[1] || "";
  const { startDate, endDate } = parseClocateDateText(dateText);

  let venue = normSpace($("h3:contains('Venue')").parent().find(".col-12 div").last().text());
  if (!venue) {
    $("h3").each((_, el) => {
      if (!/^venue$/i.test(normSpace($(el).text()))) return;
      venue = normSpace($(el).parent().find(".col-12 div").last().text());
    });
  }
  if (!venue) venue = heroLocation || jsonLd.venue;

  let country = normalizeCountry(
    jsonLd.country || extractCountryFromText(venue) || extractCountryFromText(heroLocation)
  );

  let category = "";
  $(".row.mb-2 .col-12").each((_, el) => {
    const t = normSpace($(el).text());
    if (/^(Industry|Technology|Health|Business|Science|Services|Education|Arts|Lifestyle):/i.test(t)) {
      category = t;
    }
  });

  const pastEditions = [];
  const futureEditions = [];

  const collectEditionRows = (headingRe, target) => {
    $("h3").each((_, el) => {
      if (!headingRe.test(normSpace($(el).text()))) return;
      let sib = $(el).next();
      while (sib.length && String(sib.prop("tagName")).toLowerCase() !== "h3") {
        const rows = sib.hasClass("d-flex") ? sib : sib.find(".d-flex.flex-row");
        rows.each((__, row) => {
          const line = normSpace($(row).find("div").last().text()).replace(/\(\d+\)\s*$/, "").trim();
          if (line.length > 15) target.push(line);
        });
        sib = sib.next();
      }
    });
  };

  collectEditionRows(/^past events$/i, pastEditions);
  collectEditionRows(/^future events$/i, futureEditions);

  const frequency = inferFrequencyFromEditions([...pastEditions, ...futureEditions], eventName);

  return {
    eventName,
    startDate: jsonLd.startDate || startDate,
    endDate: jsonLd.endDate || endDate,
    venue: venue || jsonLd.venue,
    country,
    category,
    previousEditions: joinEditionDates(pastEditions),
    previousVenues: "",
    frequency,
    sourceUrl: url,
  };
}

export function getClocateNextPageUrl($, baseUrl) {
  const rel = $('link[rel="next"]').attr("href");
  if (rel) return absUrl(rel, baseUrl);

  const current = new URL(baseUrl);
  const active = $(".pagination .page-item.active span, .pagination .disabled span").first().text().trim();
  const activeNum = Number(active) || 1;
  const nextLink = $(".pagination a.page-link")
    .filter((_, el) => normSpace($(el).text()) === String(activeNum + 1))
    .first()
    .attr("href");
  if (nextLink) return absUrl(nextLink, baseUrl);
  return null;
}

export const clocateAdapter = {
  id: "clocate",
  canHandle: isClocateUrl,
  needsBrowser: () => false,
  extractListing: extractClocateListing,
  extractDetail: extractClocateDetail,
  getNextPageUrl: getClocateNextPageUrl,
};
