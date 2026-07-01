import { scrapeTradeFairs } from "../lib/scraper.js";

const url = process.argv[2] || "https://www.clocate.com/conferences-in+germany/Y28tZGU=/";
const maxEvents = Number(process.argv[3]) || 5;

const r = await scrapeTradeFairs({
  url,
  maxEvents,
  maxPages: 1,
  followDetails: true,
  onProgress: (m) => {
    if (m.type === "event" || m.type === "warn") console.log(m.message);
  },
});

console.log("\n=== RESULT ===");
console.log("adapter:", r.adapter, "count:", r.eventCount);
for (const e of r.events) {
  console.log("\n---", e.eventName);
  console.log("country:", e.country, "| dates:", e.startDate, "-", e.endDate);
  console.log("venue:", e.venue);
  console.log("category:", e.category);
  console.log("previous:", e.previousEditions?.slice(0, 100));
  console.log("frequency:", e.frequency);
}
