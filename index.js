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

// Routes
app.get("/allHoldings", async (req, res) => {
  try {
    const allHoldings = await HoldingsModel.find({});
    res.json(allHoldings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/allPositions", async (req, res) => {
  try {
    const allPositions = await PositionsModel.find({});
    res.json(allPositions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/newOrder", async (req, res) => {
  try {
    const newOrder = new OrdersModel({
      name: req.body.name,
      qty: req.body.qty,
      price: req.body.price,
      mode: req.body.mode,
    });

    await newOrder.save();
    res.send("Order saved!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving order");
  }
});

// WebSocket Configuration
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected for live prices");
  let interval = null;

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === "watchlist" && Array.isArray(msg.symbols)) {
        if (interval) clearInterval(interval);

        const fetchAndSendPrices = async () => {
          console.log("Fetching live prices...");
          const results = await Promise.allSettled(
            msg.symbols.map((s) => getStockPrice(s))
          );

          const prices = results
            .filter((r) => r.status === "fulfilled" && r.value !== null)
            .map((r) => r.value);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(prices));
          }
        };

        // Fetch immediately, then set interval
        await fetchAndSendPrices();
        interval = setInterval(fetchAndSendPrices, 3000);
      }
    } catch (err) {
      console.error("Invalid WebSocket message:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    if (interval) clearInterval(interval);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    if (interval) clearInterval(interval);
  });
});

// Database & Server Initialization
server.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  try {
    await mongoose.connect(uri);
    console.log("DB connected successfully");
  } catch (err) {
    console.error("Database connection error:", err);
  }
});