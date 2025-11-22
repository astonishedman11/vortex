const express = require("express");
const path = require("path");
const app = express();

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static(path.join(__dirname)));

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // отправляем ID клиенту
  socket.emit("your-id", socket.id);

  socket.on("call-user", (data) => {
    io.to(data.to).emit("call-made", {
      offer: data.offer,
      socket: socket.id
    });
  });

  socket.on("make-answer", (data) => {
    io.to(data.to).emit("answer-made", {
      answer: data.answer,
      socket: socket.id
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on", PORT));
