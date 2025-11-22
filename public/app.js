// public/app.js — Полный рабочий WebRTC клиент (Socket.IO signalling)

// ICE servers (STUN + demo TURN)
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:global.turn.twilio.com:3478?transport=udp",
    username: "demo",
    credential: "demo"
  }
];

// Socket.IO клиент (подключается к текущему хосту)
const socket = io();

// DOM элементы
const myIdEl = document.getElementById("myId");
const targetInput = document.getElementById("targetId");
const callBtn = document.getElementById("callBtn");
const answerBtn = document.getElementById("answerBtn");
const hangupBtn = document.getElementById("hangupBtn");
const logEl = document.getElementById("log");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const ringtone = document.getElementById("ringtone");

let myId = null;
let pc = null;
let localStream = null;
let currentTarget = null;   // id собеседника (куда слать)
let incomingOffer = null;   // хранит offer, если есть входящий вызов

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(" ")}`;
  logEl.textContent = line + "\n" + logEl.textContent;
  console.log(...args);
}

/* ------------------- Socket.IO events ------------------- */

// Получаем свой ID сразу от сервера (server.js использует socket.emit("your-id", id))
socket.on("your-id", (id) => {
  myId = id;
  myIdEl.textContent = myId;
  log("Ваш ID:", id);
});

socket.on("connect", () => log("Socket connected:", socket.id));
socket.on("disconnect", () => log("Socket disconnected"));
socket.on("connect_error", (err) => log("Socket error:", err));

// Когда кто-то сделал нам offer (server -> call-made)
socket.on("call-made", (data) => {
  // data: { offer, socket } where socket is sender id
  incomingOffer = data.offer;
  currentTarget = data.socket;
  log("Входящий вызов от", currentTarget);

  // play ringtone (may be blocked until user interacts)
  ringtone.currentTime = 0;
  ringtone.play().catch(() => log("Рингтон заблокирован (нужен клик)"));
});

// Когда кто-то прислал answer на наш offer (server -> answer-made)
socket.on("answer-made", async (data) => {
  // data: { answer, socket }
  if (!pc) { log("Нет PeerConnection для установки answer"); return; }
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    log("Answer установлен от", data.socket);
    // Stop ringtone if we were ringing
    ringtone.pause();
    ringtone.currentTime = 0;
  } catch (e) {
    log("Ошибка setRemoteDescription (answer):", e);
  }
});

// ICE candidates от другого клиента
socket.on("ice-candidate", async (data) => {
  // data: { from, candidate }
  if (!pc) { log("Нет PC при получении ICE"); return; }
  if (!data || !data.candidate) return;
  try {
    await pc.addIceCandidate(data.candidate);
    log("Добавлен remote ICE candidate от", data.from);
  } catch (e) {
    log("Ошибка addIceCandidate:", e);
  }
});

/* ------------------- Local media ------------------- */

async function ensureLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    log("Local media started");
    return localStream;
  } catch (e) {
    log("Ошибка доступа к камере/микрофону:", e);
    alert("Нужен доступ к камере и микрофону. Разрешите и попробуйте снова.");
    throw e;
  }
}

/* ------------------- PeerConnection ------------------- */

function createPeerConnection() {
  const pcLocal = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // При каждом локальном кандидате — шлём серверу, чтобы он переслал другому
  pcLocal.onicecandidate = (e) => {
    if (e.candidate && currentTarget) {
      socket.emit("ice-candidate", {
        to: currentTarget,
        candidate: e.candidate,
        from: myId
      });
      log("Отправлен local ICE candidate");
    }
  };

  // Когда приходит remote stream
  pcLocal.ontrack = (e) => {
    // e.streams[0] обычно есть
    if (e.streams && e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
      log("Remote stream получен");
    } else {
      // fallback: собрать треки
      const inboundStream = new MediaStream();
      inboundStream.addTrack(e.track);
      remoteVideo.srcObject = inboundStream;
      log("Remote track получен (fallback)");
    }
  };

  pcLocal.onconnectionstatechange = () => {
    log("PC state:", pcLocal.connectionState);
    if (["failed","disconnected","closed"].includes(pcLocal.connectionState)) {
      // можно очистить UI
      log("PeerConnection закрыт/ошибка");
    }
  };

  return pcLocal;
}

/* ------------------- Buttons actions ------------------- */

// Позвонить: создаём PC, добавляем локальные треки, создаём offer и шлём его
callBtn.onclick = async () => {
  const target = (targetInput.value || "").trim();
  if (!target) return alert("Введите ID собеседника");

  currentTarget = target;

  try {
    await ensureLocalStream();

    // Создаём PC и добавляем локальные треки
    pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("call-user", { offer, to: currentTarget });
    log("Offer отправлен на", currentTarget);

    // play ringtone locally for caller
    ringtone.currentTime = 0;
    ringtone.play().catch(() => log("Рингтон заблокирован"));
  } catch (e) {
    log("Ошибка при звонке:", e);
  }
};

// Принять входящий звонок: устанавливаем remoteDescription = incomingOffer, создаём answer, шлём
answerBtn.onclick = async () => {
  if (!incomingOffer || !currentTarget) return alert("Нет входящего звонка");

  try {
    // stop ringtone
    ringtone.pause();
    ringtone.currentTime = 0;

    await ensureLocalStream();
    pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("make-answer", { answer, to: currentTarget });
    log("Answer отправлен для", currentTarget);

    // clear incomingOffer to prevent double-answer
    incomingOffer = null;
  } catch (e) {
    log("Ошибка при принятии:", e);
  }
};

// Hang up / сброс вызова
hangupBtn.onclick = () => {
  if (pc) {
    pc.getSenders().forEach(s => {
      try { if (s.track) s.track.stop(); } catch {}
    });
    pc.close();
    pc = null;
  }

  // остановим локальные треки, если нужно
  if (localStream) {
    localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
    localStream = null;
    localVideo.srcObject = null;
  }

  currentTarget = null;
  incomingOffer = null;
  remoteVideo.srcObject = null;

  ringtone.pause();
  ringtone.currentTime = 0;
  log("Вызов завершён");
};

/* ------------------- Extra: handle page unload ------------------- */

window.addEventListener("beforeunload", () => {
  try { socket.disconnect(); } catch {}
  try { if (pc) pc.close(); } catch {}
});
