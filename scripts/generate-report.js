const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "..", "src", "_data", "reports-cache.json");
const SITE_FILE = path.join(__dirname, "..", "src", "_data", "site.js");

function loadSite() {
  delete require.cache[require.resolve(SITE_FILE)];
  return require(SITE_FILE);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
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
  if (!n || Number.isNaN(n)) {
    return "$0";
  }

  if (n >= 1_000_000_000) {
    return `$${(n / 1_000_000_000).toFixed(1)}B`;
  }

  return `$${Math.round(n / 1_000_000)}M`;
}

function activityLabel(volume) {
  if (volume >= 500_000_000) return "Very High";
  if (volume >= 100_000_000) return "High";
  if (volume >= 25_000_000) return "Strong";
  return "Elevated";
}

function buildSummary(coin) {
  return `${coin.name} was one of the strongest crypto movers yesterday, gaining ${coin.price_change_percentage_24h.toFixed(1)}% over 24 hours while attracting active market participation.`;
}

function buildReasons(coin) {
  const volumeText = shortCap(coin.total_volume);

  return [
    `The token ranked among the strongest 24-hour gainers with a ${coin.price_change_percentage_24h.toFixed(1)}% move.`,
    `Roughly ${volumeText} in 24-hour trading volume suggests active short-term participation.`,
    `The move may reflect renewed momentum interest as traders rotated into recent outperformers.`
  ];
}

async function fetchGoogleNews(coinName, coinSymbol) {
  try {
    const query = encodeURIComponent(`${coinName} ${coinSymbol} crypto`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(rssUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${rssUrl}`);
    }

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

async function fetchNews(coinId, coinName, coinSymbol) {
  try {
    const url = `https://api.coingecko.com/api/v3/news?coin_id=${coinId}&page=1&per_page=3`;
    const payload = await fetchJson(url);

    const items = (payload.data || []).slice(0, 3).map((item) => ({
      title: item.title,
      source: item.news_site || "CoinGecko News",
      url: item.url,
      note: "This article is related to the token's recent market attention."
    }));

    if (items.length) {
      return items;
    }
  } catch {}

  return fetchGoogleNews(coinName, coinSymbol);
}

async function fetchDetails(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
  return fetchJson(url);
}

async function main() {
  const site = loadSite();
  const existing = loadCache();
  const usedCoinIds = existing.slice(0, 3).map((item) => item.coinId);

  const marketUrl =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd" +
    "&order=market_cap_desc" +
    "&per_page=250" +
    "&page=1" +
    "&sparkline=false" +
    "&price_change_percentage=24h";

  const markets = await fetchJson(marketUrl);

  const candidates = markets
    .filter((coin) =>
      typeof coin.price_change_percentage_24h === "number" &&
      coin.price_change_percentage_24h > 0 &&
      (coin.market_cap || 0) >= 20_000_000 &&
      (coin.total_volume || 0) >= 5_000_000 &&
      !usedCoinIds.includes(coin.id)
    )
    .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);

  const selected = candidates[0];

  if (!selected) {
    console.log("No eligible coin found. Cache unchanged.");
    return;
  }

  const details = await fetchDetails(selected.id);
  const news = await fetchNews(selected.id, selected.name, selected.symbol.toUpperCase());

  const date = getYesterdayDate();
  const report = {
    date,
    slug: `${date}-${selected.id}`,
    coinId: selected.id,
    coinName: selected.name,
    symbol: selected.symbol.toUpperCase(),
    title: `Why ${selected.symbol.toUpperCase()} Went Up Yesterday`,
    priceChange24h: Number(selected.price_change_percentage_24h.toFixed(1)),
    volumeLabel: activityLabel(selected.total_volume || 0),
    marketCap: shortCap(selected.market_cap || 0),
    summary: buildSummary(selected),
    reasons: buildReasons(selected),
    news,
    about:
      cleanText(details?.description?.en || "").slice(0, 320) ||
      `${selected.name} is a crypto asset tracked across major exchanges.`,
    reportIntro: `${selected.name} stood out as one of yesterday's strongest movers, supported by recent market momentum.`,
    binanceUrl: site.binanceReferralUrl
  };

  const nextReports = [report, ...existing]
    .filter((item, index, arr) => arr.findIndex((x) => x.coinId === item.coinId) === index);

  saveCache(nextReports);

  console.log(`Added report for ${selected.name} (${selected.symbol.toUpperCase()}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
