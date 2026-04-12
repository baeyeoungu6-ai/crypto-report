const fs = require("fs");
const path = require("path");

module.exports = async function () {
  const cacheFile = path.join(__dirname, "reports-cache.json");

  try {
    const raw = fs.readFileSync(cacheFile, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};
