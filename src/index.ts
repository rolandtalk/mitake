interface Env {
  ASSETS: Fetcher;
  HOLDINGS_JSON?: string;
}

interface HoldingRow {
  code: string;
  name: string;
  shares: number;
  averageCost: number;
  exchange: "TW" | "TWO";
}

interface HoldingSnapshot extends HoldingRow {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  marketValue: number | null;
  costValue: number;
  gainValue: number | null;
  gainPercent: number | null;
  dayChangeValue: number | null;
  dayChangePercent: number | null;
  perf1d: number | null;
  perf3d: number | null;
  perf5d: number | null;
  perf20d: number | null;
  estimatedProceeds: number | null;
  updatedAt: string | null;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

const SELL_FEE_RATE = 0.001425;
const SELL_TAX_RATE = 0.003;

const DEFAULT_HOLDINGS: HoldingRow[] = [
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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/portfolio") return handlePortfolio(env);
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;

async function handlePortfolio(env: Env): Promise<Response> {
  try {
    const snapshots = await Promise.all(readHoldings(env).map(enrichHolding));
    const totalCost = sum(snapshots.map((item) => item.costValue));
    const totalMarketValue = sum(snapshots.map((item) => item.marketValue));
    const totalGainValue = totalMarketValue - totalCost;
    return json({
      asOf: latestDate(snapshots.map((item) => item.updatedAt)),
      sourceNote: "Yahoo Finance chart data, values in TWD. Estimated proceeds subtract Taiwan sell fee and securities transaction tax.",
      summary: {
        totalCost,
        totalMarketValue,
        totalGainValue,
        totalGainPercent: totalCost > 0 ? totalGainValue / totalCost : null,
        positions: snapshots.length
      },
      holdings: snapshots.sort((left, right) => left.code.localeCompare(right.code))
    }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown portfolio error" }, 500);
  }
}

function readHoldings(env: Env): HoldingRow[] {
  if (!env.HOLDINGS_JSON) return DEFAULT_HOLDINGS;
  const parsed = JSON.parse(env.HOLDINGS_JSON) as HoldingRow[];
  return parsed.map((row): HoldingRow => ({
    code: String(row.code || "").trim(),
    name: String(row.name || row.code || "").trim(),
    shares: Number(row.shares),
    averageCost: Number(row.averageCost),
    exchange: row.exchange === "TWO" ? "TWO" : "TW"
  })).filter((row) => row.code && Number.isFinite(row.shares) && Number.isFinite(row.averageCost));
}

async function enrichHolding(holding: HoldingRow): Promise<HoldingSnapshot> {
  const symbol = `${holding.code}.${holding.exchange}`;
  const quote = await fetchYahooChart(symbol);
  const price = quote.price;
  const costValue = holding.shares * holding.averageCost;
  const marketValue = price == null ? null : holding.shares * price;
  const gainValue = marketValue == null ? null : marketValue - costValue;
  const gainPercent = gainValue == null || costValue <= 0 ? null : gainValue / costValue;
  const dayChangePerShare = price == null || quote.previousClose == null ? null : price - quote.previousClose;
  return {
    ...holding,
    symbol,
    price,
    previousClose: quote.previousClose,
    marketValue,
    costValue,
    gainValue,
    gainPercent,
    dayChangeValue: dayChangePerShare == null ? null : dayChangePerShare * holding.shares,
    dayChangePercent: dayChangePerShare == null || quote.previousClose == null || quote.previousClose <= 0 ? null : dayChangePerShare / quote.previousClose,
    perf1d: quote.perf1d,
    perf3d: quote.perf3d,
    perf5d: quote.perf5d,
    perf20d: quote.perf20d,
    estimatedProceeds: marketValue == null ? null : marketValue * (1 - SELL_FEE_RATE - SELL_TAX_RATE),
    updatedAt: quote.updatedAt
  };
}

async function fetchYahooChart(symbol: string): Promise<{
  price: number | null;
  previousClose: number | null;
  perf1d: number | null;
  perf3d: number | null;
  perf5d: number | null;
  perf20d: number | null;
  updatedAt: string | null;
}> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "1mo");
  url.searchParams.set("interval", "1d");
  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { accept: "application/json", "user-agent": "MITAKE asset value app" } });
  } catch {
    return emptyQuote();
  }
  if (!response.ok) return emptyQuote();
  const payload = await response.json() as YahooChartResponse;
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close?.filter((value): value is number => value != null) || [];
  const price = meta?.regularMarketPrice ?? closes.at(-1) ?? null;
  const previousClose = meta?.previousClose ?? meta?.chartPreviousClose ?? closes.at(-2) ?? null;
  const marketTime = meta?.regularMarketTime ?? result?.timestamp?.at(-1) ?? null;
  return {
    price: numberOrNull(price),
    previousClose: numberOrNull(previousClose),
    perf1d: performanceFromCloses(closes, 1),
    perf3d: performanceFromCloses(closes, 3),
    perf5d: performanceFromCloses(closes, 5),
    perf20d: performanceFromCloses(closes, 20),
    updatedAt: marketTime ? new Date(marketTime * 1000).toISOString() : null
  };
}

function performanceFromCloses(closes: number[], offset: number): number | null {
  const latest = closes.at(-1);
  const prior = closes.at(-1 - offset);
  return latest != null && prior != null && prior > 0 ? (latest - prior) / prior : null;
}

function emptyQuote() {
  return { price: null, previousClose: null, perf1d: null, perf3d: null, perf5d: null, perf20d: null, updatedAt: null };
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function latestDate(values: Array<string | null>): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    return latest == null || value > latest ? value : latest;
  }, null);
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
