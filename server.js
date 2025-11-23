// server.js — signaling + chat + uploads + phone-ID mapping
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, { cors: { origin: "*" } });

const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, "public")));
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no-file" });
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype
  });
});

// phone generation (Kazakhstan-style numbers); adjust if you want other format
function generateKzPhone() {
  const operators = ["700","701","702","705","707","708","747","771","775","776","777"];
  const op = operators[Math.floor(Math.random() * operators.length)];
  const num = String(Math.floor(1000000 + Math.random() * 9000000));
  return `+7 ${op} ${num.slice(0,3)} ${num.slice(3)}`;
}

// mapping phoneId -> socketId
const online = {};

io.on("connection", (socket) => {
  const phoneId = generateKzPhone();
  socket.phoneId = phoneId;
  online[phoneId] = socket.id;

  console.log("📞 Connected:", phoneId);
  socket.emit("your-id", phoneId);

  // CHAT
  // chat-message: { to?, type: 'text'|'image'|'file', text?, url?, name?, size?, mime?, time? }
  socket.on("chat-message", (data) => {
    const payload = Object.assign({}, data, { from: socket.phoneId });
    if (data.to) {
      const target = online[data.to];
      if (target) io.to(target).emit("chat-message", payload);
    } else {
      socket.broadcast.emit("chat-message", payload);
    }
  });

  socket.on("typing", (d) => {
    if (d && d.to) {
      const t = online[d.to]; if (t) io.to(t).emit("typing", { from: socket.phoneId });
    } else socket.broadcast.emit("typing", { from: socket.phoneId });
  });
  socket.on("stop-typing", (d) => {
    if (d && d.to) {
      const t = online[d.to]; if (t) io.to(t).emit("stop-typing", { from: socket.phoneId });
    } else socket.broadcast.emit("stop-typing", { from: socket.phoneId });
  });

  // WebRTC signaling via phoneId
  socket.on("call-user", (d) => {
    const target = online[d.to];
    if (!target) return socket.emit("error", { message: "target-not-found" });
    io.to(target).emit("call-made", { offer: d.offer, from: socket.phoneId });
  });

  socket.on("make-answer", (d) => {
    const target = online[d.to];
    if (!target) return;
    io.to(target).emit("answer-made", { answer: d.answer, from: socket.phoneId });
  });

  socket.on("ice-candidate", (d) => {
    const target = online[d.to];
    if (!target) return;
    io.to(target).emit("ice-candidate", { candidate: d.candidate, from: socket.phoneId });
  });

  socket.on("disconnect", () => {
    delete online[socket.phoneId];
    console.log("❌ Disconnected:", socket.phoneId);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
