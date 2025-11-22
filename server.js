// server.js — simple signaling (Express + ws)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const clients = new Map(); // id -> ws
function genId() { return Math.random().toString(36).substr(2,9); }

wss.on('connection', (ws) => {
  const id = genId();
  clients.set(id, ws);
  console.log('Client connected:', id);
  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { console.log('Bad JSON from', id); return; }
    console.log('Message from', id, ':', msg.type || msg);

    // forward to specific target (msg.to) or broadcast
    if (msg.to) {
      const target = clients.get(String(msg.to));
      if (target && target.readyState === WebSocket.OPEN) {
        // forward and include sender id
        target.send(JSON.stringify(Object.assign({}, msg, { from: id })));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'target-not-found', to: msg.to }));
      }
    } else {
      for (const [cid, cws] of clients.entries()) {
        if (cid !== id && cws.readyState === WebSocket.OPEN) {
          cws.send(JSON.stringify(Object.assign({}, msg, { from: id })));
        }
      }
    }
  });

  ws.on('close', () => { clients.delete(id); console.log('Client disconnected:', id); });
  ws.on('error', (e) => { clients.delete(id); console.log('WS error', id, e); });
});

const PORT = process.env.PORT || 3000;
// print a useful local IP address for convenience
const nets = os.networkInterfaces();
let ip = 'localhost';
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
  }
}
server.listen(PORT, () => {
  console.log(`Сервер запущен: http://${ip}:${PORT}`);
});
