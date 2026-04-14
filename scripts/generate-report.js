const fs = require("fs");
const path = require("path");

// Node fetch 안전하게 사용
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const REPORTS_FILE = path.join(__dirname, "../src/_data/reports-cache.json");
const BINANCE_REF = "https://www.binance.com/join?ref=XETYHXNR";

function loadReports() {
  try {
    return JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveReports(data) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));
}

function getReportDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatVolume(volume) {
  if (!Number.isFinite(volume)) return "-";
  if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(2)}K`;
  return `$${volume.toFixed(0)}`;
}

async function getBinanceTopMovers() {
  const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status}`);
  }

  const data = await res.json();

  return data
    .filter((item) => typeof item.symbol === "string")
    .filter((item) => item.symbol.endsWith("USDT"))
    .filter((item) => !item.symbol.startsWith("BTC"))
    .filter((item) => !item.symbol.startsWith("ETH"))
    .map((item) => ({
      rawSymbol: item.symbol,
      symbol: item.symbol.replace("USDT", ""),
      change: parseFloat(item.priceChangePercent || "0"),
      volume: parseFloat(item.quoteVolume || "0"),
      lastPrice: parseFloat(item.lastPrice || "0")
    }))
    .filter((item) => Number.isFinite(item.change))
    .filter((item) => Number.isFinite(item.volume))
    .filter((item) => item.volume > 1_000_000)
    .sort((a, b) => b.change - a.change);
}

async function fetchGoogleNews(symbol) {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      symbol + " crypto"
    )}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(rssUrl);
    if (!res.ok) return [];

    const xml = await res.text();

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 3)
      .map((match) => {
        const item = match[1];

        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
        const linkMatch = item.match(/<link>(.*?)<\/link>/);

        const title = (titleMatch?.[1] || titleMatch?.[2] || "").trim();
        const url = (linkMatch?.[1] || "").trim();

        if (!title || !url) return null;

        return {
          title,
          source: "Google News",
          url,
          note: `Recent coverage related to ${symbol}.`
        };
      })
      .filter(Boolean);

    return items;
  } catch {
    return [];
  }
}

function buildSummary(symbol, change) {
  return `${symbol} was one of the strongest Binance Futures movers yesterday, gaining ${change.toFixed(
    1
  )}% over 24 hours.`;
}

function buildIntro(symbol) {
  return `${symbol} stood out as one of yesterday’s strongest gainers on Binance Futures.`;
}

function buildAbout(symbol) {
  return `${symbol} is actively traded on Binance Futures and drew elevated trader attention during the latest 24-hour session.`;
}

function buildReasons(symbol, volume, change) {
  return [
    `${symbol} posted a ${change.toFixed(1)}% 24-hour gain, making it one of the strongest Binance Futures movers.`,
    `Trading activity remained elevated, with roughly ${formatVolume(volume)} in quote volume.`,
    `The move may have been driven by short-term momentum traders and increased speculative interest.`
  ];
}

async function main() {
  const existing = loadReports();

  // 최근 3개 리포트의 코인 중복 방지
  const recentCoinIds = existing.slice(0, 3).map((r) => String(r.coinId || "").toLowerCase());

  const movers = await getBinanceTopMovers();

  // 최근 3개와 중복되지 않는 가장 높은 순위 코인 선택
  const selected = movers.find(
    (coin) => !recentCoinIds.includes(coin.symbol.toLowerCase())
  );

  if (!selected) {
    console.log("No eligible non-duplicate mover found.");
    return;
  }

  const symbol = selected.symbol;
  const date = getReportDate();
  const news = await fetchGoogleNews(symbol);

  const newReport = {
    date,
    slug: `${date}-${symbol.toLowerCase()}`,
    coinId: symbol.toLowerCase(),
    coinName: symbol,
    symbol,
    title: `Why ${symbol} Went Up Yesterday`,
    priceChange24h: Number(selected.change.toFixed(1)),
    volumeChange24h: "Elevated",
    marketCap: "-",
    listedOnBinance: true,
    summary: buildSummary(symbol, selected.change),
    reasons: buildReasons(symbol, selected.volume, selected.change),
    news,
    about: buildAbout(symbol),
    reportIntro: buildIntro(symbol),
    binanceTradeUrl: BINANCE_REF
  };

  const updated = [newReport, ...existing]
    .filter(
      (report, index, arr) =>
        arr.findIndex(
          (x) => String(x.coinId || "").toLowerCase() === String(report.coinId || "").toLowerCase()
        ) === index
    )
    .slice(0, 3);

  saveReports(updated);

  console.log(`Updated reports-cache.json with: ${symbol}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
