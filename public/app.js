const COLUMNS = [
  { key: "country", label: "Country" },
  { key: "eventName", label: "Event name" },
  { key: "startDate", label: "Start date" },
  { key: "endDate", label: "End date" },
  { key: "venue", label: "Venue / location" },
  { key: "category", label: "Category" },
  { key: "previousEditions", label: "Previous edition dates" },
  { key: "previousVenues", label: "Previous venues" },
  { key: "frequency", label: "Frequency" },
  { key: "sourceUrl", label: "Source" },
];

let currentEvents = [];
let pollTimer = null;

const form = document.getElementById("scrapeForm");
const submitBtn = document.getElementById("submitBtn");
const statusSection = document.getElementById("statusSection");
const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");
const progressFill = document.getElementById("progressFill");
const logList = document.getElementById("logList");
const resultsSection = document.getElementById("resultsSection");
const resultsBody = document.getElementById("resultsBody");
const resultsMeta = document.getElementById("resultsMeta");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const copyTableBtn = document.getElementById("copyTableBtn");

const maxEventsInput = document.getElementById("maxEvents");
const maxPagesInput = document.getElementById("maxPages");
const scrapeAllPagesInput = document.getElementById("scrapeAllPages");

function toggleScrapeAllUi() {
  const all = scrapeAllPagesInput.checked;
  maxEventsInput.disabled = all;
  maxPagesInput.disabled = all;
  maxEventsInput.style.opacity = all ? "0.45" : "1";
  maxPagesInput.style.opacity = all ? "0.45" : "1";
}

scrapeAllPagesInput.addEventListener("change", toggleScrapeAllUi);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (pollTimer) clearInterval(pollTimer);

  const url = document.getElementById("url").value.trim();
  const scrapeAllPages = scrapeAllPagesInput.checked;
  const maxEvents = Number(maxEventsInput.value) || 30;
  const maxPages = Number(maxPagesInput.value) || 3;
  const followDetails = document.getElementById("followDetails").checked;
  const useBrowser = document.getElementById("useBrowser").checked;

  resetUi();
  submitBtn.disabled = true;

  try {
    const resp = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, maxEvents, maxPages, scrapeAllPages, followDetails, useBrowser }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed to start scrape");

    statusSection.classList.remove("hidden");
    pollJob(data.jobId, maxEvents);
  } catch (err) {
    showError(err.message);
    submitBtn.disabled = false;
  }
});

function resetUi() {
  statusSection.classList.remove("hidden");
  resultsSection.classList.add("hidden");
  statusBadge.textContent = "Running";
  statusBadge.className = "badge badge-running";
  statusText.textContent = "Starting crawl…";
  progressFill.style.width = "5%";
  logList.innerHTML = "";
  currentEvents = [];
}

function pollJob(jobId, maxEvents) {
  pollTimer = setInterval(async () => {
    try {
      const resp = await fetch(`/api/scrape/${jobId}`);
      const job = await resp.json();
      if (!resp.ok) throw new Error(job.error || "Job not found");

      updateProgress(job, maxEvents);

      if (job.status === "completed") {
        clearInterval(pollTimer);
        pollTimer = null;
        submitBtn.disabled = false;
        showResults(job.result);
      } else if (job.status === "failed") {
        clearInterval(pollTimer);
        pollTimer = null;
        submitBtn.disabled = false;
        showError(job.error || "Scrape failed");
      }
    } catch (err) {
      clearInterval(pollTimer);
      pollTimer = null;
      submitBtn.disabled = false;
      showError(err.message);
    }
  }, 1200);
}

function updateProgress(job, maxEvents) {
  const logs = job.logs || [];
  const last = logs[logs.length - 1];

  if (last?.type === "event" && last.total) {
    const pct = Math.min(95, Math.round((last.found / last.total) * 100));
    progressFill.style.width = `${pct}%`;
    statusText.textContent = `Extracted ${last.found} of ~${last.total} events…`;
  } else if (last?.message) {
    statusText.textContent = last.message;
  }

  logList.innerHTML = logs
    .slice(-30)
    .map((l) => {
      const cls = l.type === "warn" ? "log-warn" : "";
      return `<li class="${cls}">${escapeHtml(l.message || l.type)}</li>`;
    })
    .join("");
  logList.scrollTop = logList.scrollHeight;
}

function showResults(result) {
  statusBadge.textContent = "Done";
  statusBadge.className = "badge badge-done";
  progressFill.style.width = "100%";
  statusText.textContent = `Finished — ${result.eventCount} events extracted from ${result.pagesScraped} page(s)`;

  currentEvents = result.events || [];
  resultsSection.classList.remove("hidden");

  resultsMeta.textContent = `Source: ${result.sourceUrl} · Adapter: ${result.adapter || "generic"}${result.browserMode ? " · browser" : ""} · Scraped at ${new Date(result.scrapedAt).toLocaleString()}`;

  resultsBody.innerHTML = currentEvents
    .map((ev) => {
      return `<tr>${COLUMNS.map((col) => {
        const val = ev[col.key] || "";
        if (col.key === "sourceUrl" && val) {
          return `<td><a href="${escapeAttr(val)}" target="_blank" rel="noopener">Link</a></td>`;
        }
        const display = val || '<span class="empty-cell">—</span>';
        return `<td>${col.key === "sourceUrl" ? display : escapeHtml(val) || display}</td>`;
      }).join("")}</tr>`;
    })
    .join("");
}

function showError(msg) {
  statusBadge.textContent = "Failed";
  statusBadge.className = "badge badge-failed";
  statusText.textContent = msg;
  progressFill.style.width = "0%";
}

exportCsvBtn.addEventListener("click", () => {
  if (!currentEvents.length) return;
  const header = COLUMNS.filter((c) => c.key !== "sourceUrl").map((c) => c.label);
  header.push("Source URL");

  const rows = currentEvents.map((ev) =>
    [...COLUMNS.filter((c) => c.key !== "sourceUrl").map((c) => ev[c.key] || ""), ev.sourceUrl || ""]
      .map(csvEscape)
      .join(",")
  );

  const bom = "\uFEFF";
  const csv = bom + [header.map(csvEscape).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `trade-fairs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

copyTableBtn.addEventListener("click", async () => {
  if (!currentEvents.length) return;
  const lines = [
    COLUMNS.map((c) => c.label).join("\t"),
    ...currentEvents.map((ev) => COLUMNS.map((c) => ev[c.key] || "").join("\t")),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    copyTableBtn.textContent = "Copied!";
    setTimeout(() => {
      copyTableBtn.textContent = "Copy table";
    }, 2000);
  } catch {
    alert("Could not copy to clipboard. Use Export CSV instead.");
  }
});

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
