
// Live stock WebSocket is handled by backend/index.js.
//
// This file is intentionally kept as a small compatibility module
// so that no second WebSocket server is created.

function initStockSocket() {
  console.log("Stock WebSocket is managed by backend/index.js");
}

module.exports = initStockSocket;

