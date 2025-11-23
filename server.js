// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// static
app.use(express.static(path.join(__dirname, 'public')));

// multer for uploads (file from form fetch)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, id + ext);
  }
});
const upload = multer({ storage });

// POST /upload — загружает файл и возвращает { url, name, size, type }
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no-file' });
  const url = `/uploads/${req.file.filename}`;
  res.json({
    url,
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype
  });
});

// simple root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// socket.io signaling + chat
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  // send id
  socket.emit('your-id', socket.id);

  // chat message: { to, type, text?, url?, name?, size?, mime? }
  socket.on('chat-message', (data) => {
    // if to specified — forward to single client, else broadcast to everyone (except sender)
    if (data.to) {
      io.to(data.to).emit('chat-message', Object.assign({}, data, { from: socket.id }));
    } else {
      socket.broadcast.emit('chat-message', Object.assign({}, data, { from: socket.id }));
    }
  });

  // typing indicator
  socket.on('typing', (data) => {
    if (data.to) io.to(data.to).emit('typing', { from: socket.id });
    else socket.broadcast.emit('typing', { from: socket.id });
  });
  socket.on('stop-typing', (data) => {
    if (data.to) io.to(data.to).emit('stop-typing', { from: socket.id });
    else socket.broadcast.emit('stop-typing', { from: socket.id });
  });

  // relay for webrtc signalling (optional)
  socket.on('call-user', (d) => { if (d.to) io.to(d.to).emit('call-made', { offer: d.offer, socket: socket.id }); });
  socket.on('make-answer', (d) => { if (d.to) io.to(d.to).emit('answer-made', { answer: d.answer, socket: socket.id }); });
  socket.on('ice-candidate', (d) => { if (d.to) io.to(d.to).emit('ice-candidate', { candidate: d.candidate, from: socket.id }); });

  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log('🚀 Server running on port', PORT));
