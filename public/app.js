const refreshButton = document.getElementById("refresh-button");
const sourceNote = document.getElementById("source-note");
const heroGain = document.getElementById("hero-gain");
const totalMarketValue = document.getElementById("total-market-value");
const totalCost = document.getElementById("total-cost");
const totalGainValue = document.getElementById("total-gain-value");
const totalGainPercent = document.getElementById("total-gain-percent");
const positionsCount = document.getElementById("positions-count");
const holdingsBody = document.getElementById("holdings-body");
const holdingsTable = document.getElementById("holdings-table");
const sortButtons = Array.from(document.querySelectorAll(".sort-button"));
const columnToggleButtons = {
  shares: document.getElementById("toggle-shares"),
  cost: document.getElementById("toggle-cost"),
  price: document.getElementById("toggle-price")
};

let currentHoldings = [];
let sortState = { key: "symbol", direction: "asc" };
let columnVisibility = { shares: true, cost: true, price: true };

refreshButton.addEventListener("click", loadPortfolio);
Object.entries(columnToggleButtons).forEach(([key, button]) => {
  button.addEventListener("click", () => {
    columnVisibility[key] = !columnVisibility[key];
    applyColumnVisibility();
  });
});

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextKey = button.dataset.sortKey;
    if (!nextKey) return;
    sortState = {
      key: nextKey,
      direction: sortState.key === nextKey && sortState.direction === "asc" ? "desc" : "asc"
    };
    updateSortButtons();
    renderHoldings();
  });
});

loadPortfolio();

async function loadPortfolio() {
  setLoading(true);
  try {
    const response = await fetch("/api/portfolio", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load portfolio");
    renderPortfolio(payload);
  } catch (error) {
    sourceNote.textContent = error instanceof Error ? error.message : "Unable to load portfolio";
    holdingsBody.innerHTML = '<tr><td colspan="14" class="empty-state">Unable to load Yahoo Finance data.</td></tr>';
  } finally {
    setLoading(false);
  }
}

function renderPortfolio(payload) {
  const { summary, holdings } = payload;
  sourceNote.textContent = payload.asOf
    ? `${payload.sourceNote} Updated ${formatTimestamp(payload.asOf)}.`
    : payload.sourceNote;
  heroGain.textContent = `${formatSignedMoney(summary.totalGainValue)} (${formatSignedPercent(summary.totalGainPercent)})`;
  heroGain.className = `hero-change ${tone(summary.totalGainValue)}`;
  totalMarketValue.textContent = formatMoney(summary.totalMarketValue);
  totalCost.textContent = formatMoney(summary.totalCost);
  totalGainValue.textContent = formatSignedMoney(summary.totalGainValue);
  totalGainValue.className = `money accent ${tone(summary.totalGainValue)}`;
  totalGainPercent.textContent = formatSignedPercent(summary.totalGainPercent);
  totalGainPercent.className = `money small ${tone(summary.totalGainValue)}`;
  positionsCount.textContent = `${summary.positions} positions`;
  currentHoldings = holdings;
  updateSortButtons();
  renderHoldings();
}

function renderHoldings() {
  const sortedHoldings = [...currentHoldings].sort(compareHoldings);
  holdingsBody.innerHTML = sortedHoldings.length
    ? sortedHoldings.map(renderRow).join("")
    : '<tr><td colspan="14" class="empty-state">No holdings found.</td></tr>';
  applyColumnVisibility();
}

function renderRow(row) {
  return `
    <tr>
      <td><a href="https://finance.yahoo.com/quote/${encodeURIComponent(row.symbol)}" target="_blank" rel="noreferrer">${escapeHtml(row.symbol)}</a></td>
      <td>${escapeHtml(row.name)}</td>
      <td data-column="shares">${formatNumber(row.shares)}</td>
      <td data-column="cost">${formatMoney(row.averageCost, 2)}</td>
      <td data-column="price">${formatMaybeMoney(row.price, 2)}</td>
      <td>${formatMaybeMoney(row.marketValue)}</td>
      <td class="${tone(row.gainValue)}">${formatMaybeSignedMoney(row.gainValue)}</td>
      <td class="${tone(row.gainValue)}">${formatMaybeSignedPercent(row.gainPercent)}</td>
      <td class="${tone(row.dayChangeValue)}">${formatMaybeSignedPercent(row.dayChangePercent)}</td>
      <td class="${tone(row.perf1d)}">${formatMaybeSignedPercent(row.perf1d)}</td>
      <td class="${tone(row.perf3d)}">${formatMaybeSignedPercent(row.perf3d)}</td>
      <td class="${tone(row.perf5d)}">${formatMaybeSignedPercent(row.perf5d)}</td>
      <td class="${tone(row.perf20d)}">${formatMaybeSignedPercent(row.perf20d)}</td>
      <td>${formatMaybeMoney(row.estimatedProceeds)}</td>
    </tr>`;
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "Refreshing..." : "Refresh";
}

function compareHoldings(left, right) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  const leftValue = left[sortState.key];
  const rightValue = right[sortState.key];
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * direction;
  }
  if (leftValue == null && rightValue == null) return 0;
  if (leftValue == null) return 1;
  if (rightValue == null) return -1;
  return (leftValue - rightValue) * direction;
}

function updateSortButtons() {
  sortButtons.forEach((button) => {
    const isActive = button.dataset.sortKey === sortState.key;
    const indicator = button.querySelector(".sort-indicator");
    button.classList.toggle("active", isActive);
    button.dataset.sortDirection = isActive ? sortState.direction : "none";
    if (indicator) indicator.textContent = isActive ? (sortState.direction === "asc" ? "▲" : "▼") : "↕";
  });
}

function applyColumnVisibility() {
  Object.entries(columnVisibility).forEach(([key, isVisible]) => {
    holdingsTable.classList.toggle(`hide-${key}`, !isVisible);
    const button = columnToggleButtons[key];
    button.classList.toggle("active", isVisible);
    button.setAttribute("aria-pressed", String(isVisible));
  });
}

function tone(value) {
  if (value == null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function formatMoney(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatMaybeMoney(value, digits = 0) {
  return value == null ? "--" : formatMoney(value, digits);
}

function formatSignedMoney(value) {
  return `${value >= 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
}

function formatMaybeSignedMoney(value) {
  return value == null ? "--" : formatSignedMoney(value);
}

function formatSignedPercent(value) {
  if (value == null) return "--";
  const percent = value * 100;
  return `${percent >= 0 ? "+" : "-"}${Math.abs(percent).toFixed(2)}%`;
}

function formatMaybeSignedPercent(value) {
  return value == null ? "--" : formatSignedPercent(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
