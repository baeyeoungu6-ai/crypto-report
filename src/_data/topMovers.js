const fs = require("fs");
const path = require("path");

module.exports = function () {
  const cacheFile = path.join(__dirname, "top-movers-cache.json");

  try {
    const raw = fs.readFileSync(cacheFile, "utf8");
    const data = JSON.parse(raw);

    return {
      updatedAt: data.updatedAt || null,
      items: Array.isArray(data.items) ? data.items : []
    };
  } catch {
    return {
      updatedAt: null,
      items: []
    };
  }
};
