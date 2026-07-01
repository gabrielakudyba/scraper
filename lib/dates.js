const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|" +
  "jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

const DATE_PATTERNS = [
  // 15-17 March 2026
  new RegExp(`(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, "gi"),
  // March 15-17, 2026
  new RegExp(`(${MONTHS})\\s+(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2}),?\\s+(\\d{4})`, "gi"),
  // 15 March 2026
  new RegExp(`(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, "gi"),
  // 2026-03-15
  /(\d{4})-(\d{2})-(\d{2})/g,
  // 15.03.2026 or 15/03/2026
  /(\d{1,2})[./](\d{1,2})[./](\d{4})/g,
  // DD.MM.YYYY - DD.MM.YYYY
  /(\d{1,2})[./](\d{1,2})[./](\d{4})\s*[-–—]\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/g,
];

const MONTH_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function toIso(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseMonthName(name) {
  return MONTH_MAP[String(name).toLowerCase()] || 0;
}

export function formatIsoDate(iso) {
  if (!iso) return "";
  return iso;
}

export function extractDateRange(text) {
  if (!text) return { startDate: "", endDate: "" };

  const rangeDot = /(\d{1,2})[./](\d{1,2})[./](\d{4})\s*[-–—]\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/i.exec(text);
  if (rangeDot) {
    return {
      startDate: toIso(rangeDot[3], rangeDot[2], rangeDot[1]),
      endDate: toIso(rangeDot[6], rangeDot[5], rangeDot[4]),
    };
  }

  const crossMonth = new RegExp(
    `(?<!\\d)(\\d{1,2})\\s+(${MONTHS})\\s*[-–—]\\s*(\\d{1,2})\\s+(${MONTHS}),?\\s+(\\d{4})`,
    "i"
  ).exec(text);
  if (crossMonth) {
    return {
      startDate: toIso(crossMonth[5], parseMonthName(crossMonth[2]), crossMonth[1]),
      endDate: toIso(crossMonth[5], parseMonthName(crossMonth[4]), crossMonth[3]),
    };
  }

  const rangeMonth = new RegExp(
    `(?<!\\d)(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`,
    "i"
  ).exec(text);
  if (rangeMonth) {
    const m = parseMonthName(rangeMonth[3]);
    return {
      startDate: toIso(rangeMonth[4], m, rangeMonth[1]),
      endDate: toIso(rangeMonth[4], m, rangeMonth[2]),
    };
  }

  const rangeMonth2 = new RegExp(
    `(${MONTHS})\\s+(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2}),?\\s+(\\d{4})`,
    "i"
  ).exec(text);
  if (rangeMonth2) {
    const m = parseMonthName(rangeMonth2[1]);
    return {
      startDate: toIso(rangeMonth2[4], m, rangeMonth2[2]),
      endDate: toIso(rangeMonth2[4], m, rangeMonth2[3]),
    };
  }

  const iso = /(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return { startDate: iso[1], endDate: iso[1] };

  const dmy = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(text);
  if (dmy) {
    const d = toIso(dmy[3], dmy[2], dmy[1]);
    return { startDate: d, endDate: d };
  }

  const named = new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, "i").exec(text);
  if (named) {
    const d = toIso(named[3], parseMonthName(named[2]), named[1]);
    return { startDate: d, endDate: d };
  }

  return { startDate: "", endDate: "" };
}

export function findAllYears(text) {
  if (!text) return [];
  const years = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
  return [...new Set(years)].sort((a, b) => b - a);
}

/** Extract a single date or date range label from free text (for past editions). */
export function extractEditionDateLabel(text) {
  if (!text) return "";

  const { startDate, endDate } = extractDateRange(text);
  if (startDate && endDate && startDate !== endDate) return `${startDate} – ${endDate}`;
  if (startDate) return startDate;

  const monthYear = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i.exec(text);
  if (monthYear) return monthYear[0];

  const years = findAllYears(text);
  return years.length ? String(years[0]) : "";
}

export function joinEditionDates(lines) {
  const dates = [];
  const seen = new Set();
  for (const line of lines) {
    const d = extractEditionDateLabel(line);
    if (d && !seen.has(d)) {
      seen.add(d);
      dates.push(d);
    }
  }
  return dates.join(", ");
}
