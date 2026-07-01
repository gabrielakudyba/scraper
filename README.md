# Trade Fair Scraper

Advanced web scraper for trade fairs, conferences, and exhibitions with dedicated site adapters.

## Supported sites

| Site | Status | Notes |
|------|--------|-------|
| **clocate.com** | Full support | Listing pages, country filters, event detail pages, past editions, categories |
| **10times.com** | Browser mode | Cloudflare protected — requires Playwright + optional manual verification |

## Quick start

```bash
cd trade-fair-scraper
npm install
npm start
```

Open **http://localhost:3847**

## Example URLs

**Clocate (works out of the box):**
- https://www.clocate.com/
- https://www.clocate.com/conferences-in+germany/Y28tZGU=/
- https://www.clocate.com/smm-shipbuilding-machinery-and-marine-trade-fair/16477/

**10times (enable "Force browser mode"):**
- https://10times.com/events

If 10times shows a Cloudflare verification page:

```bash
npm run start:visible
```

Complete the verification once in the browser window that opens. Cookies are saved in `.browser-profile/` for future runs.

## Output columns

Country, Event name, Start/End dates, Venue, Category, Previous editions, Previous venues, Frequency, Source URL

## Tech

- Node.js + Express + Cheerio
- Playwright (Chromium) for JavaScript / Cloudflare sites
- Site-specific adapters in `lib/adapters/`
