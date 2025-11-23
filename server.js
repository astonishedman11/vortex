const express = require("express");
const path = require("path");
const app = express();

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "public")));

// ==========================
//   ГЕНЕРАЦИЯ НОМЕРА
// ==========================
function generateKzPhone() {
  const operators = ["700","701","702","705","707","708","747","771","775","776","777"];
  const op = operators[Math.floor(Math.random() * operators.length)];
  const num = String(Math.floor(1000000 + Math.random() * 9000000));
  return `+7 ${op} ${num.slice(0,3)} ${num.slice(3)}`;
}

// phoneId → socketId
const onlineUsers = {};

io.on("connection", socket => {
  const phoneId = generateKzPhone();
  onlineUsers[phoneId] = socket.id;

  socket.phoneId = phoneId;

  console.log("📞 User connected:", phoneId);
  socket.emit("your-id", phoneId);

  // ВЫЗОВ
  socket.on("call-user", data => {
    const targetSocket = onlineUsers[data.to];
    if (!targetSocket) return;

    io.to(targetSocket).emit("call-made", {
      offer: data.offer,
      from: phoneId
    });
  });

  // ОТВЕТ
  socket.on("make-answer", data => {
    const targetSocket = onlineUsers[data.to];
    if (!targetSocket) return;

    io.to(targetSocket).emit("answer-made", {
      answer: data.answer,
      from: phoneId
    });
  });

  // ICE-кандидат
  socket.on("ice-candidate", data => {
    const targetSocket = onlineUsers[data.to];
    if (!targetSocket) return;

    io.to(targetSocket).emit("ice-candidate", {
      candidate: data.candidate,
      from: phoneId
    });
  });

  // ОТКЛЮЧЕН
  socket.on("disconnect", () => {
    delete onlineUsers[phoneId];
    console.log("❌ User left:", phoneId);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
