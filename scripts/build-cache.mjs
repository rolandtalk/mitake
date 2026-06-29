import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const holdings = [
  ["1301", "TW"], ["1802", "TW"], ["2049", "TW"], ["2317", "TW"], ["2330", "TW"],
  ["2379", "TW"], ["2395", "TW"], ["2408", "TW"], ["2454", "TW"], ["2882", "TW"],
  ["3008", "TW"], ["3131", "TWO"], ["3443", "TW"], ["6190", "TWO"], ["6290", "TWO"],
  ["6446", "TW"], ["6770", "TW"], ["8054", "TWO"], ["9914", "TW"]
];

const quotes = {};

for (const [code, exchange] of holdings) {
  const symbol = `${code}.${exchange}`;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("range", "1mo");
  url.searchParams.set("interval", "1d");
  const response = await fetch(url, { headers: { "user-agent": "MITAKE asset value app" } });
  if (!response.ok) continue;
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close?.filter((value) => value != null) || [];
  const marketTime = meta?.regularMarketTime ?? result?.timestamp?.at(-1) ?? null;
  quotes[symbol] = {
    price: meta?.regularMarketPrice ?? closes.at(-1) ?? null,
    previousClose: meta?.previousClose ?? meta?.chartPreviousClose ?? closes.at(-2) ?? null,
    perf1d: performanceFromCloses(closes, 1),
    perf3d: performanceFromCloses(closes, 3),
    perf5d: performanceFromCloses(closes, 5),
    perf20d: performanceFromCloses(closes, 20),
    updatedAt: marketTime ? new Date(marketTime * 1000).toISOString() : null
  };
}

await mkdir(join(process.cwd(), "data"), { recursive: true });
await writeFile(join(process.cwd(), "data", "portfolio-cache.json"), JSON.stringify({ quotes }, null, 2));
console.log(`Cached ${Object.keys(quotes).length} Yahoo Finance quotes.`);

function performanceFromCloses(closes, offset) {
  const latest = closes.at(-1);
  const prior = closes.at(-1 - offset);
  return latest != null && prior != null && prior > 0 ? (latest - prior) / prior : null;
}
