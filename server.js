// server.js — signaling server for Railway (Express + ws)
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const clients = new Map();

function genId() {
  return Math.random().toString(36).substr(2, 9);
}

wss.on("connection", (ws) => {
  const id = genId();
  clients.set(id, ws);
  console.log("Client connected:", id);

  ws.send(JSON.stringify({ type: "id", id }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      console.log("Bad JSON from", id);
      return;
    }

    if (msg.to) {
      const target = clients.get(String(msg.to));
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({ ...msg, from: id }));
      } else {
        ws.send(JSON.stringify({ type: "error", message: "target-not-found", to: msg.to }));
      }
    } else {
      for (const [cid, cws] of clients.entries()) {
        if (cid !== id && cws.readyState === WebSocket.OPEN) {
          cws.send(JSON.stringify({ ...msg, from: id }));
        }
      }
    }
  });

  ws.on("close", () => clients.delete(id));
  ws.on("error", () => clients.delete(id));
});

// Railway automatically gives process.env.PORT
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
