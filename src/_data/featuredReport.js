module.exports = async function () {
  const reports = await require("./reports.js")();
  return reports[0] || null;
};
