import * as cheerio from "cheerio";
import fs from "fs";

const url = process.argv[2] || "https://www.clocate.com/";
const resp = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html",
  },
});
const html = await resp.text();
fs.writeFileSync("debug-page.html", html);
const $ = cheerio.load(html);

console.log("URL:", url, "status:", resp.status, "len:", html.length);

const patterns = [
  'a[href*="/conference"]',
  'a[href*="/exhibition"]',
  'a[href*="/event"]',
  ".featured-event",
  "[class*='event']",
  "h2 a",
  "article",
];

for (const sel of patterns) {
  console.log(sel, "=>", $(sel).length);
}

console.log("\n--- sample links ---");
$("a[href]").each((_, el) => {
  const href = $(el).attr("href") || "";
  if (!/conference|exhibition|event|fair|seminar/i.test(href)) return;
  const text = $(el).text().replace(/\s+/g, " ").trim();
  if (text.length < 5) return;
  console.log(href.slice(0, 80), "|", text.slice(0, 70));
});

console.log("\n--- featured section ---");
$("h2").slice(0, 10).each((_, el) => {
  const block = $(el).parent();
  console.log("H2:", $(el).text().trim().slice(0, 80));
  console.log("  parent text:", block.text().replace(/\s+/g, " ").trim().slice(0, 120));
  const link = block.find("a").first().attr("href");
  if (link) console.log("  link:", link);
});
