// public/app.js
// Chat + file upload + typing + emoji + basic WebRTC hooks (integrates with server.js signaling)

const socket = io(); // socket.io client auto-connect

// UI
const myIdEl = document.getElementById('myId');
const messagesBox = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendMsgBtn = document.getElementById('sendMsgBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const typingEl = document.getElementById('typing');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPanel = document.getElementById('emojiPanel');

const targetInput = document.getElementById('targetId');

// WebRTC elements (optional usage)
const callBtn = document.getElementById('callBtn');
const answerBtn = document.getElementById('answerBtn');
const hangupBtn = document.getElementById('hangupBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const ringtone = document.getElementById('ringtone');

let myId = null;
let currentTarget = null;
let typingTimer = null;
let isTyping = false;
let lastTypingAt = 0;

// --- helper to render message
function addMessageHTML({ from, text, type, time, url, name, size, mime }) {
  const el = document.createElement('div');
  el.className = 'msg';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${from} • ${new Date(time || Date.now()).toLocaleTimeString()}`;
  el.appendChild(meta);

  if (type === 'text') {
    const p = document.createElement('div'); p.textContent = text; el.appendChild(p);
  } else if (type === 'image') {
    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '6px';
    el.appendChild(img);
    if (text) { const cap = document.createElement('div'); cap.textContent = text; el.appendChild(cap); }
  } else if (type === 'file') {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'file';
    a.textContent = `📎 ${name || 'file'} (${(size/1024).toFixed(1)}KB) — скачать`;
    el.appendChild(a);
    if (text) { const cap = document.createElement('div'); cap.textContent = text; el.appendChild(cap); }
  }

  messagesBox.prepend(el);
}

// --- socket events
socket.on('your-id', id => {
  myId = id; myIdEl.textContent = id;
});

socket.on('chat-message', data => {
  // receive: { from, to?, type, text?, url?, name?, size?, mime? }
  addMessageHTML(data);
});

// typing
socket.on('typing', (d) => {
  typingEl.textContent = `${d.from} печатает...`;
});
socket.on('stop-typing', (d) => {
  typingEl.textContent = '';
});

// --- message send
sendMsgBtn.onclick = sendMessage;
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
  // typing indicator
  handleTyping();
});

// handle typing state with debounce
function handleTyping() {
  if (!myId) return;
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing', { to: targetInput.value || null });
  }
  lastTypingAt = Date.now();
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    const timeDiff = Date.now() - lastTypingAt;
    if (timeDiff >= 700) {
      isTyping = false;
      socket.emit('stop-typing', { to: targetInput.value || null });
    }
  }, 800);
}

function sendMessage() {
  const text = msgInput.value.trim();
  const to = targetInput.value.trim() || null;
  if (!text) return;
  const payload = { to, type: 'text', text, time: Date.now() };
  socket.emit('chat-message', payload);
  addMessageHTML(Object.assign({}, payload, { from: 'Вы' }));
  msgInput.value = '';
  socket.emit('stop-typing', { to });
  isTyping = false;
}

// --- emoji picker
emojiBtn.onclick = () => {
  emojiPanel.style.display = emojiPanel.style.display === 'none' ? 'flex' : 'none';
};
document.querySelectorAll('.emoji').forEach(b => {
  b.addEventListener('click', () => {
    msgInput.value += b.textContent;
    msgInput.focus();
    handleTyping();
  });
});

// --- attach file
attachBtn.onclick = () => fileInput.click();
fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  // upload via fetch
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/upload', { method: 'POST', body: fd });
  const json = await res.json();
  if (json && json.url) {
    const to = targetInput.value.trim() || null;
    const isImage = file.type.startsWith('image/');
    const payload = {
      to,
      type: isImage ? 'image' : 'file',
      url: json.url,
      name: json.name,
      size: json.size,
      mime: json.type,
      time: Date.now()
    };
    socket.emit('chat-message', payload);
    addMessageHTML(Object.assign({}, payload, { from: 'Вы' }));
  }
  fileInput.value = '';
};

// --- simple WebRTC hooks (connect to existing signaling if used)
// you already have separate webrtc code; optional tiny integration:
socket.on('call-made', d => {
  // you can reuse your existing handlers for RTC
  console.log('incoming call from', d.socket);
});

// --- utility: allow clicking messages to open images/files
messagesBox.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a) { /* default behavior downloads */ }
});
