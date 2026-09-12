const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

/**
 * Get live NSE stock price.
 *
 * Input:
 *   RELIANCE
 *   TCS
 *   INFY
 *
 * Automatically converts to:
 *   RELIANCE.NS
 *   TCS.NS
 *   INFY.NS
 */
async function getStockPrice(symbol) {
  try {
    if (!symbol || typeof symbol !== "string") {
      return null;
    }

    const cleanSymbol = symbol
      .trim()
      .toUpperCase();

    if (!cleanSymbol) {
      return null;
    }

    const ticker = cleanSymbol.includes(".")
      ? cleanSymbol
      : `${cleanSymbol}.NS`;

    const quote = await yahooFinance.quote(ticker);

    if (
      !quote ||
      quote.regularMarketPrice === undefined ||
      quote.regularMarketPrice === null
    ) {
      return null;
    }

    const price = Number(
      quote.regularMarketPrice
    );

    const change = Number(
      quote.regularMarketChange || 0
    );

    const changePercent = Number(
      quote.regularMarketChangePercent || 0
    );

    return {
      symbol: cleanSymbol,

      name:
        quote.shortName ||
        quote.longName ||
        cleanSymbol,

      price,

      ltp: price,

      change: Number(change.toFixed(2)),

      changePercent: Number(
        changePercent.toFixed(2)
      ),

      day: `${changePercent.toFixed(2)}%`,

      isLoss: changePercent < 0,

      marketState:
        quote.marketState || null,

      timestamp: Date.now(),
    };
  } catch (error) {
    console.error(
      `Error fetching live price for ${symbol}:`,
      error.message
    );

    return null;
  }
}

module.exports = {
  getStockPrice,
};
