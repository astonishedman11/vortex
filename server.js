const express = require("express");
const path = require("path");
const app = express();

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: { origin: "*" }
});

// Папка public
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  // Отправляем ID клиенту
  socket.emit("your-id", socket.id);

  // OFFER
  socket.on("call-user", data => {
    io.to(data.to).emit("call-made", {
      offer: data.offer,
      socket: socket.id
    });
  });

  // ANSWER
  socket.on("make-answer", data => {
    io.to(data.to).emit("answer-made", {
      answer: data.answer,
      socket: socket.id
    });
  });

  // ❗ ICE candidates — без этого WebRTC НЕ РАБОТАЕТ
  socket.on("ice-candidate", data => {
    io.to(data.to).emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id
    });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () =>
  console.log("🚀 Server running on port", PORT)
);
