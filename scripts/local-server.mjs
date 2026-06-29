import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const publicDir = join(root, "public");
const cachePath = join(root, "data", "portfolio-cache.json");
const port = Number(process.env.PORT || 8787);
const sellFeeRate = 0.001425;
const sellTaxRate = 0.003;

const holdings = [
  { code: "1301", name: "台塑", shares: 200, averageCost: 35.56, exchange: "TW" },
  { code: "1802", name: "台玻", shares: 390, averageCost: 44.86, exchange: "TW" },
  { code: "2049", name: "上銀", shares: 28, averageCost: 326.79, exchange: "TW" },
  { code: "2317", name: "鴻海", shares: 91, averageCost: 161.08, exchange: "TW" },
  { code: "2330", name: "台積電", shares: 39, averageCost: 1112.13, exchange: "TW" },
  { code: "2379", name: "瑞昱", shares: 155, averageCost: 449.1, exchange: "TW" },
  { code: "2395", name: "研華", shares: 22, averageCost: 482.5, exchange: "TW" },
  { code: "2408", name: "南亞科", shares: 17, averageCost: 459.12, exchange: "TW" },
  { code: "2454", name: "聯發科", shares: 52, averageCost: 4033.19, exchange: "TW" },
  { code: "2882", name: "國泰金", shares: 300, averageCost: 55.96, exchange: "TW" },
  { code: "3008", name: "大立光", shares: 17, averageCost: 3179.35, exchange: "TW" },
  { code: "3131", name: "弘塑", shares: 40, averageCost: 2854.25, exchange: "TWO" },
  { code: "3443", name: "創意", shares: 5, averageCost: 1325.6, exchange: "TW" },
  { code: "6190", name: "萬泰科", shares: 50, averageCost: 39.92, exchange: "TWO" },
  { code: "6290", name: "良維", shares: 10, averageCost: 286.2, exchange: "TWO" },
  { code: "6446", name: "藥華藥", shares: 16, averageCost: 950.75, exchange: "TW" },
  { code: "6770", name: "力積電", shares: 100, averageCost: 82.14, exchange: "TW" },
  { code: "8054", name: "安國", shares: 1, averageCost: 107, exchange: "TWO" },
  { code: "9914", name: "美利達", shares: 1, averageCost: 69, exchange: "TW" }
];

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/portfolio") {
      sendJson(response, await buildPortfolio());
      return;
    }
    await sendStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, { error: error instanceof Error ? error.message : "Server error" }, 500);
  }
}).listen(port, "127.0.0.1", () => console.log(`MITAKE local preview: http://127.0.0.1:${port}`));

async function buildPortfolio() {
  const snapshots = await Promise.all(holdings.map(enrichHolding));
  const totalCost = sum(snapshots.map((item) => item.costValue));
  const totalMarketValue = sum(snapshots.map((item) => item.marketValue));
  const totalGainValue = totalMarketValue - totalCost;
  return {
    asOf: latestDate(snapshots.map((item) => item.updatedAt)),
    sourceNote: "Yahoo Finance chart data, values in TWD.",
    summary: { totalCost, totalMarketValue, totalGainValue, totalGainPercent: totalCost > 0 ? totalGainValue / totalCost : null, positions: snapshots.length },
    holdings: snapshots.sort((left, right) => left.code.localeCompare(right.code))
  };
}

async function enrichHolding(holding) {
  const symbol = `${holding.code}.${holding.exchange}`;
  const quote = await fetchYahooChart(symbol);
  const price = quote.price;
  const costValue = holding.shares * holding.averageCost;
  const marketValue = price == null ? null : holding.shares * price;
  const gainValue = marketValue == null ? null : marketValue - costValue;
  const dayChange = price == null || quote.previousClose == null ? null : price - quote.previousClose;
  return {
    ...holding,
    symbol,
    price,
    previousClose: quote.previousClose,
    marketValue,
    costValue,
    gainValue,
    gainPercent: gainValue == null || costValue <= 0 ? null : gainValue / costValue,
    dayChangeValue: dayChange == null ? null : dayChange * holding.shares,
    dayChangePercent: dayChange == null || quote.previousClose == null ? null : dayChange / quote.previousClose,
    perf1d: quote.perf1d,
    perf3d: quote.perf3d,
    perf5d: quote.perf5d,
    perf20d: quote.perf20d,
    estimatedProceeds: marketValue == null ? null : marketValue * (1 - sellFeeRate - sellTaxRate),
    updatedAt: quote.updatedAt
  };
}

async function fetchYahooChart(symbol) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "1mo");
  url.searchParams.set("interval", "1d");
  let response;
  try {
    response = await fetch(url, { headers: { "user-agent": "MITAKE asset value app" } });
  } catch {
    return readCachedQuote(symbol);
  }
  if (!response.ok) return readCachedQuote(symbol);
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close?.filter((value) => value != null) || [];
  const marketTime = meta?.regularMarketTime ?? result?.timestamp?.at(-1) ?? null;
  return {
    price: meta?.regularMarketPrice ?? closes.at(-1) ?? null,
    previousClose: meta?.previousClose ?? meta?.chartPreviousClose ?? closes.at(-2) ?? null,
    perf1d: performanceFromCloses(closes, 1),
    perf3d: performanceFromCloses(closes, 3),
    perf5d: performanceFromCloses(closes, 5),
    perf20d: performanceFromCloses(closes, 20),
    updatedAt: marketTime ? new Date(marketTime * 1000).toISOString() : null
  };
}

async function readCachedQuote(symbol) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    return cache.quotes?.[symbol] || emptyQuote();
  } catch {
    return emptyQuote();
  }
}

function performanceFromCloses(closes, offset) {
  const latest = closes.at(-1);
  const prior = closes.at(-1 - offset);
  return latest != null && prior != null && prior > 0 ? (latest - prior) / prior : null;
}

function emptyQuote() {
  return { price: null, previousClose: null, perf1d: null, perf3d: null, perf5d: null, perf20d: null, updatedAt: null };
}

async function sendStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) return sendJson(response, { error: "Not found" }, 404);
  response.writeHead(200, { "content-type": contentType(filePath) });
  response.end(await readFile(filePath));
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(data));
}

function contentType(filePath) {
  return { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" }[extname(filePath)] || "application/octet-stream";
}

function sum(values) { return values.reduce((total, value) => total + (value ?? 0), 0); }
function latestDate(values) { return values.reduce((latest, value) => !value ? latest : latest == null || value > latest ? value : latest, null); }
