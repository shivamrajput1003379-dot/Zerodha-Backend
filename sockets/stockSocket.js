const WebSocket = require('ws');
const { getStockPrice } = require('../services/priceService');
const watchlist = require('../config/watchlist');

function initStockSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected for live prices');

    const interval = setInterval(async () => {
      const prices = await Promise.all(
        watchlist.map(symbol => getStockPrice(symbol))
      );
      ws.send(JSON.stringify(prices.filter(p => p !== null)));
    }, 5000);

    ws.on('close', () => clearInterval(interval));
  });
}

module.exports = initStockSocket;