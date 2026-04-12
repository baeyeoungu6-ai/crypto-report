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

function formatUsd(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "$0";

  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  }

  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }

  return `$${value.toFixed(2)}`;
}

module.exports = async function () {
  const excluded = new Set([
    "tether",
    "usd-coin",
    "binance-usd",
    "dai",
    "usde",
    "ethena-usde",
    "first-digital-usd",
    "usdd",
    "frax",
    "true-usd",
    "pax-dollar",
    "paypal-usd",
    "wrapped-bitcoin",
    "staked-ether",
    "weth"
  ]);

  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets" +
      "?vs_currency=usd" +
      "&order=market_cap_desc" +
      "&per_page=250" +
      "&page=1" +
      "&sparkline=false" +
      "&price_change_percentage=24h";

    const data = await fetchJson(url);

    const items = data
      .filter((coin) =>
        typeof coin.price_change_percentage_24h === "number" &&
        coin.price_change_percentage_24h > 0 &&
        (coin.market_cap || 0) >= 50_000_000 &&
        (coin.total_volume || 0) >= 10_000_000 &&
        !excluded.has(coin.id)
      )
      .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
      .slice(0, 10)
      .map((coin, index) => ({
        rank: index + 1,
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
        image: coin.image,
        price: formatUsd(coin.current_price || 0),
        change24h: Number(coin.price_change_percentage_24h.toFixed(1)),
        marketCap: formatUsd(coin.market_cap || 0),
        volume: formatUsd(coin.total_volume || 0)
      }));

    return {
      updatedAt: new Date().toISOString(),
      items
    };
  } catch {
    return {
      updatedAt: null,
      items: []
    };
  }
};
