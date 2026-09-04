// services/priceService.js
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function getStockPrice(symbol) {
  try {
    const ticker = symbol.includes(".") ? symbol : `${symbol}.NS`;
    const quote = await yahooFinance.quote(ticker);

    if (!quote || quote.regularMarketPrice === undefined) {
      return null;
    }

    return {
      name: symbol,
      price: quote.regularMarketPrice,
      day: `${quote.regularMarketChangePercent ? quote.regularMarketChangePercent.toFixed(2) : "0.00"}%`,
      isLoss: quote.regularMarketChangePercent < 0,
    };
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error.message);
    return null;
  }
}

module.exports = { getStockPrice };