const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

const { HoldingsModel } = require("./model/HoldingsModel");
const { PositionsModel } = require("./model/PositionsModel");
const { OrdersModel } = require("./model/OrdersModel");
const { getStockPrice } = require("./services/priceService");

const PORT = process.env.PORT || 3002;
const uri = process.env.MONGO_URL;

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(bodyParser.json());

/* =========================================================
   REST APIs
========================================================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Zerodha backend is running",
  });
});

// Holdings
app.get("/allHoldings", async (req, res) => {
  try {
    const allHoldings = await HoldingsModel.find({});
    res.json(allHoldings);
  } catch (err) {
    console.error("allHoldings error:", err);
    res.status(500).json({
      error: err.message,
    });
  }
});

// Positions
app.get("/allPositions", async (req, res) => {
  try {
    const allPositions = await PositionsModel.find({});
    res.json(allPositions);
  } catch (err) {
    console.error("allPositions error:", err);
    res.status(500).json({
      error: err.message,
    });
  }
});

// Orders
app.get("/allOrders", async (req, res) => {
  try {
    const allOrders = await OrdersModel.find({}).sort({
      _id: -1,
    });

    res.json(allOrders);
  } catch (err) {
    console.error("allOrders error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// Create Order
app.post("/newOrder", async (req, res) => {
  try {
    const newOrder = new OrdersModel({
      name: req.body.name,
      qty: req.body.qty,
      price: req.body.price,
      mode: req.body.mode,
    });

    await newOrder.save();

    res.json({
      success: true,
      message: "Order saved!",
      order: newOrder,
    });
  } catch (err) {
    console.error("newOrder error:", err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* =========================================================
   LIVE PRICE HELPERS
========================================================= */

function normalizeSymbols(symbols = []) {
  return [
    ...new Set(
      symbols
        .filter(
          (symbol) =>
            typeof symbol === "string"
        )
        .map((symbol) =>
          symbol.trim().toUpperCase()
        )
        .filter(Boolean)
    ),
  ];
}

async function fetchPrices(symbols) {
  const cleanSymbols =
    normalizeSymbols(symbols);

  if (cleanSymbols.length === 0) {
    return [];
  }

  const results =
    await Promise.allSettled(
      cleanSymbols.map((symbol) =>
        getStockPrice(symbol)
      )
    );

  return results
    .filter(
      (result) =>
        result.status === "fulfilled" &&
        result.value !== null
    )
    .map((result) => result.value);
}

/* =========================================================
   WEBSOCKET
========================================================= */

const wss = new WebSocket.Server({
  server,
});

console.log("✅ WebSocket server initialized");

/*
  Keep every WebSocket connection alive.

  Render / reverse proxies can close connections
  if they appear idle for too long.
*/
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(
        "⚠️ Terminating inactive WebSocket"
      );

      return ws.terminate();
    }

    ws.isAlive = false;

    try {
      ws.ping();
    } catch (error) {
      console.error(
        "WebSocket ping error:",
        error.message
      );
    }
  });
}, 15000);

/* =========================================================
   NEW CLIENT
========================================================= */

wss.on("connection", (ws, request) => {
  console.log(
    "✅ Live-price client connected",
    request?.socket?.remoteAddress || ""
  );

  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  let interval = null;
  let isFetching = false;

  let subscribedSymbols = [];

  /* =======================================================
     SEND LIVE PRICES
  ======================================================= */

  const sendLivePrices = async () => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (subscribedSymbols.length === 0) {
      return;
    }

    /*
      Prevent overlapping Yahoo requests.
    */
    if (isFetching) {
      console.log(
        "⏳ Previous price request still running..."
      );

      return;
    }

    isFetching = true;

    try {
      const prices =
        await fetchPrices(
          subscribedSymbols
        );

      if (ws.readyState === WebSocket.OPEN) {
        const message = {
          type: "prices",
          timestamp: Date.now(),
          data: prices,
        };

        ws.send(
          JSON.stringify(message)
        );

        console.log(
          `📈 Sent ${prices.length} prices at ${new Date().toLocaleTimeString()}`
        );
      }
    } catch (error) {
      console.error(
        "❌ Live price fetch error:",
        error.message
      );
    } finally {
      isFetching = false;
    }
  };

  /* =======================================================
     START PRICE LOOP
  ======================================================= */

  const startPriceLoop = async () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    /*
      First update immediately.
    */
    await sendLivePrices();

    if (
      ws.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    /*
      Then every 3 seconds.
    */
    interval = setInterval(() => {
      sendLivePrices();
    }, 3000);

    console.log(
      "🔄 3-second live price loop started"
    );
  };

  /* =======================================================
     CLIENT MESSAGES
  ======================================================= */

  ws.on("message", async (data) => {
    try {
      const message =
        JSON.parse(data.toString());

      /* ---------------------------------------------------
         SUBSCRIBE
      --------------------------------------------------- */

      if (
        message.type === "subscribe" &&
        Array.isArray(message.symbols)
      ) {
        subscribedSymbols =
          normalizeSymbols(
            message.symbols
          );

        console.log(
          "📡 Subscribed symbols:",
          subscribedSymbols
        );

        await startPriceLoop();

        return;
      }

      /* ---------------------------------------------------
         OLD WATCHLIST FORMAT
      --------------------------------------------------- */

      if (
        message.type === "watchlist" &&
        Array.isArray(message.symbols)
      ) {
        subscribedSymbols =
          normalizeSymbols(
            message.symbols
          );

        console.log(
          "📋 Watchlist symbols:",
          subscribedSymbols
        );

        await startPriceLoop();

        return;
      }

      /* ---------------------------------------------------
         UPDATE SYMBOLS
      --------------------------------------------------- */

      if (
        message.type === "updateSymbols" &&
        Array.isArray(message.symbols)
      ) {
        subscribedSymbols =
          normalizeSymbols(
            message.symbols
          );

        console.log(
          "🔄 Symbols updated:",
          subscribedSymbols
        );

        /*
          Immediately fetch using new symbols.
        */
        await sendLivePrices();

        return;
      }

      /* ---------------------------------------------------
         APPLICATION PING
      --------------------------------------------------- */

      if (message.type === "ping") {
        if (
          ws.readyState ===
          WebSocket.OPEN
        ) {
          ws.send(
            JSON.stringify({
              type: "pong",
              timestamp: Date.now(),
            })
          );
        }

        return;
      }
    } catch (error) {
      console.error(
        "❌ Invalid WebSocket message:",
        error.message
      );

      if (
        ws.readyState ===
        WebSocket.OPEN
      ) {
        ws.send(
          JSON.stringify({
            type: "error",
            message:
              "Invalid WebSocket message",
          })
        );
      }
    }
  });

  /* =======================================================
     CLOSE
  ======================================================= */

  ws.on("close", () => {
    console.log(
      "❌ Live-price client disconnected"
    );

    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  });

  /* =======================================================
     ERROR
  ======================================================= */

  ws.on("error", (error) => {
    console.error(
      "❌ WebSocket error:",
      error.message
    );

    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  });
});

/* =========================================================
   SERVER SHUTDOWN
========================================================= */

process.on("SIGTERM", () => {
  console.log(
    "SIGTERM received. Shutting down..."
  );

  clearInterval(
    heartbeatInterval
  );

  wss.clients.forEach((ws) => {
    ws.close();
  });

  server.close(() => {
    process.exit(0);
  });
});

/* =========================================================
   DATABASE + SERVER
========================================================= */

server.listen(PORT, async () => {
  console.log(
    `🚀 Server listening on port ${PORT}`
  );

  try {
    await mongoose.connect(uri);

    console.log(
      "✅ MongoDB connected successfully"
    );
  } catch (err) {
    console.error(
      "❌ Database connection error:",
      err.message
    );
  }
});