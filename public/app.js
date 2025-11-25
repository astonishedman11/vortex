// public/app.js — phone-ID aware WebRTC + Chat (files/images) + typing + emoji
const socket = io();

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

// WebRTC elements
const callBtn = document.getElementById('callBtn');
const answerBtn = document.getElementById('answerBtn');
const hangupBtn = document.getElementById('hangupBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const ringtone = document.getElementById('ringtone');

let myId = null;
let currentTarget = null;
let pc = null;
let localStream = null;
let incomingOffer = null;
let pendingCandidates = [];

// ICE servers
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
// public/app.js — добавлена поддержка ГЛОБАЛЬНОГО режима (broadcast)
// (оставшиеся части твоего app.js оставляем как есть; ниже — вставлять в начало/заменять соответствующие блоки)

// === GLOBAL CHAT SWITCH ===
const globalChk = document.getElementById("globalChk");

// восстановление сохранённого состояния
const savedGlobal = localStorage.getItem("globalChat") === "true";
if (savedGlobal) {
    globalChk.checked = true;
}

// реагируем на включение/выключение глобалки
globalChk.addEventListener("change", () => {
    const state = globalChk.checked;
    localStorage.setItem("globalChat", state ? "true" : "false");

    // визуальная подсветка (не обязательно)
    if (state) {
        globalChk.parentElement.style.color = "#4caf50";
    } else {
        globalChk.parentElement.style.color = "";
    }
});


// --- действие отправки сообщения (обновлённый sendMessage) ---
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  const isGlobal = globalChk && globalChk.checked;
  const to = isGlobal ? null : (targetInput.value.trim() || null);

  const payload = { to, type: "text", text, time: Date.now() };

  socket.emit("chat-message", payload);
  addMessageHTML({ ...payload, from: "Вы" });

  msgInput.value = "";
  socket.emit("stop-typing", { to });
}


// --- при отправке файла тоже учитывать Global ---
fileInput.onchange = async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/upload", { method: "POST", body: fd });
  const json = await res.json();

  const isImage = file.type.startsWith("image/");
  const isGlobal = globalChk && globalChk.checked;
  const to = isGlobal ? null : (targetInput.value.trim() || null);

  const payload = {
    to,
    type: isImage ? "image" : "file",
    url: json.url,
    name: json.name,
    size: json.size,
    mime: json.mime,
    time: Date.now()
  };

  socket.emit("chat-message", payload);
  addMessageHTML({ ...payload, from: "Вы" });

  fileInput.value = "";
};


// --- typing indicator should also respect Global (optional) ---
let typingTimer = null;
let isTyping = false;

function handleTyping() {
  if (!myId) return;

  const isGlobal = globalChk && globalChk.checked;
  const to = isGlobal ? null : (targetInput.value.trim() || null);

  if (!isTyping) {
      isTyping = true;
      socket.emit("typing", { to });
  }

  if (typingTimer) clearTimeout(typingTimer);

  typingTimer = setTimeout(() => {
      isTyping = false;
      socket.emit("stop-typing", { to });
  }, 800);
}


// ----------------- helpers -----------------
function addMessageHTML({ from, text, type, time, url, name, size, mime }) {
  const el = document.createElement('div'); el.className = 'msg';
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = `${from} • ${new Date(time||Date.now()).toLocaleTimeString()}`;
  el.appendChild(meta);

  if (type === 'text') {
    const p = document.createElement('div'); p.textContent = text; el.appendChild(p);
  } else if (type === 'image') {
    const img = document.createElement('img'); img.src = url; img.style.maxWidth = '100%'; img.style.borderRadius='6px';
    el.appendChild(img); if (text) { const c=document.createElement('div'); c.textContent=text; el.appendChild(c); }
  } else if (type === 'file') {
    const a = document.createElement('a'); a.href = url; a.download = name || 'file';
    a.textContent = `📎 ${name || 'file'} (${(size/1024).toFixed(1)}KB) — скачать`; el.appendChild(a);
    if (text) { const c=document.createElement('div'); c.textContent=text; el.appendChild(c); }
  }
  messagesBox.prepend(el);
}

// ----------------- socket handlers -----------------
socket.on('your-id', id => { myId = id; myIdEl.textContent = id; });
socket.on('chat-message', data => addMessageHTML(data));
socket.on('typing', d => { typingEl.textContent = `${d.from} печатает...`; });
socket.on('stop-typing', d => { typingEl.textContent = ''; });

// WebRTC signaling
socket.on('call-made', async (data) => {
  // incoming offer from phoneId in data.from
  incomingOffer = data.offer;
  currentTarget = data.from;
  console.log('Incoming call from', currentTarget);
  ringtone.currentTime = 0; ringtone.play().catch(()=>{});
});

socket.on('answer-made', async (data) => {
  if (!pc) return console.warn('No pc for answer');
  await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  console.log('Answer set');
  ringtone.pause(); ringtone.currentTime = 0;
});

// ice candidate incoming
socket.on('ice-candidate', async (data) => {
  if (!pc) {
    pendingCandidates.push(data.candidate);
    return;
  }
  try { await pc.addIceCandidate(data.candidate); console.log('Added remote ICE'); }
  catch(e){ console.error('addIceCandidate err', e); }
});

// ----------------- typing -----------------
let typingTimer = null;
let isTyping = false;
function handleTyping() {
  if (!myId) return;
  if (!isTyping) { isTyping = true; socket.emit('typing', { to: targetInput.value || null }); }
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false; socket.emit('stop-typing', { to: targetInput.value || null });
  }, 800);
}

// ----------------- send message -----------------
sendMsgBtn.onclick = sendMessage;
msgInput.addEventListener('keydown', (e) => { if (e.key==='Enter') sendMessage(); handleTyping(); });

function sendMessage() {
  const text = msgInput.value.trim(); const to = targetInput.value.trim() || null;
  if (!text) return;
  const payload = { to, type: 'text', text, time: Date.now() };
  socket.emit('chat-message', payload);
  addMessageHTML(Object.assign({}, payload, { from: 'Вы' }));
  msgInput.value = '';
  socket.emit('stop-typing', { to });
}

// ----------------- emoji -----------------
const emojiList = ['😀','😂','😍','😎','😢','👍','🔥','🎉','🙌','🤝','😉','😅'];
emojiList.forEach(e => {
  const b = document.createElement('button'); b.className='emoji'; b.textContent = e; b.onclick = () => {
    msgInput.value += e; msgInput.focus(); handleTyping();
  }; emojiPanel.appendChild(b);
});
emojiBtn.onclick = () => emojiPanel.style.display = emojiPanel.style.display === 'none' ? 'flex' : 'none';

// ----------------- file upload -----------------
attachBtn.onclick = () => fileInput.click();
fileInput.onchange = async (ev) => {
  const file = ev.target.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/upload', { method: 'POST', body: fd });
  const json = await res.json();
  if (json && json.url) {
    const to = targetInput.value.trim() || null;
    const isImage = file.type.startsWith('image/');
    const payload = { to, type: isImage ? 'image' : 'file', url: json.url, name: json.name, size: json.size, mime: json.mime, time: Date.now() };
    socket.emit('chat-message', payload);
    addMessageHTML(Object.assign({}, payload, { from: 'Вы' }));
  }
  fileInput.value = '';
};

// ----------------- WebRTC helpers -----------------
async function ensureLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    localVideo.srcObject = localStream;
    return localStream;
  } catch (e) { alert('Разреши камеру/микрофон'); throw e; }
}

function createPeerConnection() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = (e) => {
    if (e.candidate && currentTarget) {
      socket.emit('ice-candidate', { to: currentTarget, candidate: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    if (e.streams && e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
    } else {
      const s = new MediaStream(); s.addTrack(e.track); remoteVideo.srcObject = s;
    }
  };

  pc.onconnectionstatechange = () => console.log('pc state', pc.connectionState);

  // apply pending candidates if any
  pendingCandidates.forEach(c => pc.addIceCandidate(c).catch(console.error));
  pendingCandidates = [];

  // add local tracks if we already have stream
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // expose for debugging
  window.pc = pc;
  return pc;
}

// ----------------- call / answer / hangup -----------------
callBtn.onclick = async () => {
  const to = targetInput.value.trim();
  if (!to) return alert('Введите номер собеседника');
  currentTarget = to;
  await ensureLocalStream();
  createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('call-user', { to: currentTarget, offer });
  ringtone.currentTime = 0; ringtone.play().catch(()=>{});
};

answerBtn.onclick = async () => {
  if (!incomingOffer || !currentTarget) return alert('Нет входящего звонка');
  ringtone.pause(); ringtone.currentTime = 0;
  await ensureLocalStream();
  createPeerConnection();
  await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('make-answer', { to: currentTarget, answer });
  incomingOffer = null;
};

hangupBtn.onclick = () => {
  if (pc) { pc.getSenders().forEach(s => s.track && s.track.stop()); pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t=>t.stop()); localStream=null; localVideo.srcObject=null; }
  remoteVideo.srcObject = null; currentTarget=null; incomingOffer=null; ringtone.pause(); ringtone.currentTime=0;
};

// when server informs about incoming call
socket.on('call-made', (data) => {
  incomingOffer = data.offer;
  currentTarget = data.from;
  console.log('Incoming from', data.from);
  ringtone.currentTime = 0; ringtone.play().catch(()=>{});
});

// expose for debugging
window.pc = pc;





