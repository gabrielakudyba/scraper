import { chromium } from "playwright";

const url = process.argv[2] || "https://10times.com/events";
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 900 },
  locale: "en-US",
});
const page = await context.newPage();
await page.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => false });
});
console.log("Loading", url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
try {
  await page.waitForFunction(
    () => !document.title.includes("Just a moment") && document.body.innerText.length > 500,
    { timeout: 60000 }
  );
} catch {
  console.log("Still on challenge page...");
}
await page.waitForTimeout(5000);
const title = await page.title();
const html = await page.content();
console.log("title:", title, "len:", html.length);

const allLinks = await page.$$eval("a[href]", (as) =>
  as.map((a) => ({ href: a.href, text: a.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) }))
);
const eventLinks = allLinks.filter(
  (x) =>
    /10times\.com/i.test(x.href) &&
    !/login|signup|about|contact|javascript/i.test(x.href) &&
    x.text.length > 5
);
console.log("links total", allLinks.length, "candidates", eventLinks.length);
eventLinks.slice(0, 20).forEach((l) => console.log(l.href, "|", l.text));

const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log("body snippet:\n", bodySnippet);

await browser.close();
