const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "..", "src", "_data", "reports-cache.json");
const SITE_FILE = path.join(__dirname, "..", "src", "_data", "site.js");

function loadSite() {
  delete require.cache[require.resolve(SITE_FILE)];
  return require(SITE_FILE);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveCache(data) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2) + "\n");
}

function getYesterdayDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function cleanText(value = "") {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function shortCap(n) {
  if (!n || Number.isNaN(n)) return "-";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  return `$${Math.round(n)}`;
}

function shortVolume(n) {
  if (!n || Number.isNaN(n)) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

function activityLabel(volume) {
  if (volume >= 1_000_000_000) return "Very High";
  if (volume >= 250_000_000) return "High";
  if (volume >= 50_000_000) return "Strong";
  return "Elevated";
}

function buildSummary(asset) {
  return `${asset.coinName} was one of the strongest Binance Futures movers yesterday, gaining ${asset.change.toFixed(1)}% over 24 hours while attracting active derivatives participation.`;
}

function buildReasons(asset) {
  return [
    `${asset.coinName} ranked among the strongest 24-hour Binance USDⓈ-M Futures gainers with a ${asset.change.toFixed(1)}% move.`,
    `Roughly ${shortVolume(asset.quoteVolume)} in 24-hour quote volume suggests active short-term participation.`,
    `The move may reflect renewed momentum interest as traders rotated into recent outperformers.`
  ];
}

async function fetchGoogleNews(coinName, coinSymbol) {
  try {
    const query = encodeURIComponent(`${coinName} ${coinSymbol} crypto`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(rssUrl);

    if (!response.ok) throw new Error(`HTTP ${response.status} for ${rssUrl}`);

    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3);

    return items.map((match) => {
      const item = match[1];
      const cdataTitle = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const plainTitle = item.match(/<title>(.*?)<\/title>/);
      const title = (cdataTitle?.[1] || plainTitle?.[1] || `${coinName} latest news`)
        .replace(/\s+/g, " ")
        .trim();
      const url =
        item.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ||
        `https://news.google.com/search?q=${encodeURIComponent(`${coinName} crypto`)}`;

      return {
        title,
        source: "Google News",
        url,
        note: "Latest related coverage surfaced from Google News search."
      };
    });
  } catch {
    return [];
  }
}

async function searchCoinGecko(symbol, coinNameGuess) {
  try {
    const query = encodeURIComponent(symbol);
    const data = await fetchJson(`https://api.coingecko.com/api/v3/search?query=${query}`);
    const coins = Array.isArray(data.coins) ? data.coins : [];
    const exactSymbol = coins.find(
      (c) => String(c.symbol || "").toUpperCase() === String(symbol || "").toUpperCase()
    );
    if (exactSymbol) return exactSymbol;
    const byName = coins.find(
      (c) => String(c.name || "").toLowerCase() === String(coinNameGuess || "").toLowerCase()
    );
    return byName || coins[0] || null;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoDetails(coinId) {
  try {
    return await fetchJson(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
    );
  } catch {
    return null;
  }
}

async function fetchCoinGeckoNews(coinId) {
  try {
    const payload = await fetchJson(
      `https://api.coingecko.com/api/v3/news?coin_id=${coinId}&page=1&per_page=3`
    );
    const items = (payload.data || []).slice(0, 3).map((item) => ({
      title: item.title,
      source: item.news_site || "CoinGecko News",
      url: item.url,
      note: "This article is related to the token's recent market attention."
    }));
    return items;
  } catch {
    return [];
  }
}

async function resolveAssetMeta(symbol) {
  const searchResult = await searchCoinGecko(symbol, symbol);
  if (!searchResult) {
    return {
      coinId: symbol.toLowerCase(),
      coinName: symbol,
      marketCap: "-",
      about: `${symbol} is actively traded on Binance USDⓈ-M Futures.`,
      news: await fetchGoogleNews(symbol, symbol)
    };
  }

  const details = await fetchCoinGeckoDetails(searchResult.id);
  const coinName = details?.name || searchResult.name || symbol;
  const marketCap = shortCap(details?.market_data?.market_cap?.usd);
  const about =
    cleanText(details?.description?.en || "").slice(0, 320) ||
    `${coinName} is actively traded on Binance USDⓈ-M Futures.`;

  let news = await fetchCoinGeckoNews(searchResult.id);
  if (!news.length) {
    news = await fetchGoogleNews(coinName, symbol);
  }

  return {
    coinId: searchResult.id || symbol.toLowerCase(),
    coinName,
    marketCap,
    about,
    news
  };
}

async function fetchTopFuturesMovers() {
  const data = await fetchJson("https://fapi.binance.com/fapi/v1/ticker/24hr");
  return data
    .filter((x) => typeof x.symbol === "string" && x.symbol.endsWith("USDT"))
    .filter((x) => !x.symbol.startsWith("BTC") && !x.symbol.startsWith("ETH"))
    .map((x) => ({
      symbol: x.symbol.replace(/USDT$/, ""),
      rawSymbol: x.symbol,
      change: parseFloat(x.priceChangePercent || "0"),
      quoteVolume: parseFloat(x.quoteVolume || "0"),
      lastPrice: parseFloat(x.lastPrice || "0")
    }))
    .filter((x) => Number.isFinite(x.change) && Number.isFinite(x.quoteVolume))
    .filter((x) => x.quoteVolume >= 1_000_000)
    .sort((a, b) => b.change - a.change);
}

async function main() {
  const site = loadSite();
  const existing = loadCache();
  const recentCoinKeys = existing.slice(0, 3).map((item) => String(item.symbol || item.coinId || "").toLowerCase());

  const movers = await fetchTopFuturesMovers();
  const selectedBase = movers.find(
    (item) => !recentCoinKeys.includes(item.symbol.toLowerCase())
  );

  if (!selectedBase) {
    console.log("No eligible non-duplicate futures mover found. Cache unchanged.");
    return;
  }

  const meta = await resolveAssetMeta(selectedBase.symbol);
  const date = getYesterdayDate();

  const report = {
    date,
    slug: `${date}-${selectedBase.symbol.toLowerCase()}`,
    coinId: meta.coinId,
    coinName: meta.coinName,
    symbol: selectedBase.symbol.toUpperCase(),
    title: `Why ${selectedBase.symbol.toUpperCase()} Went Up Yesterday`,
    priceChange24h: Number(selectedBase.change.toFixed(1)),
    volumeLabel: activityLabel(selectedBase.quoteVolume),
    marketCap: meta.marketCap,
    summary: buildSummary({ ...selectedBase, coinName: meta.coinName }),
    reasons: buildReasons({ ...selectedBase, coinName: meta.coinName }),
    news: meta.news,
    about: meta.about,
    reportIntro: `${meta.coinName} stood out as one of yesterday's strongest Binance Futures movers, supported by recent market momentum.`,
    binanceUrl: site.binanceReferralUrl
  };

  const nextReports = [report, ...existing]
    .filter((item, index, arr) => {
      const key = String(item.symbol || item.coinId || "").toLowerCase();
      return arr.findIndex((x) => String(x.symbol || x.coinId || "").toLowerCase() === key) === index;
    })
    .slice(0, 3);

  saveCache(nextReports);

  console.log(`Added report for ${meta.coinName} (${selectedBase.symbol.toUpperCase()}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
