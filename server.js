import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { scrapeTradeFairs } from "./lib/scraper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const activeJobs = new Map();

function validateUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL. Please enter a full URL starting with http:// or https://");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  return parsed.href;
}

app.post("/api/scrape", async (req, res) => {
  try {
    const url = validateUrl(req.body?.url);
    const scrapeAllPages = req.body?.scrapeAllPages === true;
    const maxEvents = scrapeAllPages
      ? 10000
      : Math.min(Math.max(Number(req.body?.maxEvents) || 30, 1), 200);
    const maxPages = scrapeAllPages
      ? 500
      : Math.min(Math.max(Number(req.body?.maxPages) || 3, 1), 20);
    const followDetails = req.body?.followDetails !== false;
    const useBrowser =
      req.body?.useBrowser === true ? true : req.body?.useBrowser === false ? false : null;

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const logs = [];

    const job = {
      id: jobId,
      status: "running",
      logs,
      result: null,
      error: null,
    };
    activeJobs.set(jobId, job);

    res.json({ jobId, message: "Scrape job started" });

    scrapeTradeFairs({
      url,
      maxEvents,
      maxPages,
      scrapeAllPages,
      followDetails,
      useBrowser,
      onProgress: (msg) => {
        logs.push({ ...msg, at: new Date().toISOString() });
        if (logs.length > 500) logs.shift();
      },
    })
      .then((result) => {
        job.status = "completed";
        job.result = result;
      })
      .catch((err) => {
        job.status = "failed";
        job.error = err.message || String(err);
      });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.get("/api/scrape/:jobId", (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({
    id: job.id,
    status: job.status,
    logs: job.logs,
    result: job.result,
    error: job.error,
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "trade-fair-scraper" });
});

app.listen(PORT, () => {
  console.log(`Trade Fair Scraper running at http://localhost:${PORT}`);
});
