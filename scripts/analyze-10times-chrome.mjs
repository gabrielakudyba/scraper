import { chromium } from "playwright";

const url = process.argv[2] || "https://10times.com/events";
let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  console.log("Using installed Chrome");
} catch {
  browser = await chromium.launch({ headless: false });
  console.log("Using bundled Chromium");
}
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
console.log("Loading", url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(15000);
console.log("title:", await page.title());
const links = await page.$$eval("a[href]", (as) =>
  as
    .map((a) => ({ href: a.href, text: a.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) }))
    .filter((x) => /10times\.com/i.test(x.href) && x.text.length > 4)
    .slice(0, 25)
);
links.forEach((l) => console.log(l.href, "|", l.text));
await browser.close();
