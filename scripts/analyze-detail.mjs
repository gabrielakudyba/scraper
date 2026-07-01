import * as cheerio from "cheerio";

const url = process.argv[2] || "https://www.clocate.com/developer-week-dwx/24888/";
const resp = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
});
const html = await resp.text();
const $ = cheerio.load(html);

console.log("title:", $("h1").first().text().trim());
console.log("json-ld:", $('script[type="application/ld+json"]').length);

$("table tr, .row, dl dt").slice(0, 30).each((_, el) => {
  const t = $(el).text().replace(/\s+/g, " ").trim();
  if (t.length > 5 && t.length < 200) console.log(t);
});

const body = $("body").text().replace(/\s+/g, " ");
for (const kw of ["Previous", "Annual", "Biennial", "Frequency", "Category", "Venue", "Country", "Edition"]) {
  const idx = body.search(new RegExp(kw, "i"));
  if (idx >= 0) console.log(kw + ":", body.slice(Math.max(0, idx - 20), idx + 120));
}
