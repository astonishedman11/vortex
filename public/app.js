// app.js — WebRTC + Socket.IO (исправленная версия)

// ICE
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:global.turn.twilio.com:3478?transport=udp",
    username: "demo",
    credential: "demo",
  }
];

// Socket.IO клиент
const socket = io("/", {
  transports: ["websocket"], // важно для Railway
});

// DOM
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
let currentTarget = null;
let incomingOffer = null;

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(" ")}`;
  logEl.textContent = line + "\n" + logEl.textContent;
  console.log(...args);
}

// SOCKET.IO events
socket.on("connect", () => log("Socket connected:", socket.id));
socket.on("disconnect", () => log("Socket disconnected"));
socket.on("connect_error", (e) => log("Socket error:", e));

// Входящие сообщения
socket.on("message", async (msg) => {
  log("Message:", msg.type || msg);

  // получить свой ID
  if (msg.type === "id") {
    myId = String(msg.id);
    myIdEl.textContent = myId;
    return;
  }

  // входящий offer
  if (msg.type === "offer" && String(msg.target) === myId) {
    currentTarget = String(msg.from);
    incomingOffer = msg.offer;
    log("Входящий вызов от", currentTarget);

    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
    return;
  }

  // входящий answer
  if (msg.type === "answer" && String(msg.target) === myId) {
    if (!pc) return log("Нет pc для answer");
    await pc.setRemoteDescription(msg.answer);
    log("Answer установлен");
    ringtone.pause(); ringtone.currentTime = 0;
    return;
  }

  // ICE
  if (msg.type === "candidate" && String(msg.target) === myId) {
    if (pc && msg.candidate) {
      await pc.addIceCandidate(msg.candidate).catch(err => log("ICE error:", err));
      log("ICE добавлен");
    }
  }

  if (msg.type === "error") log("Server error:", msg.message);
});

// Получить камеру/мик
async function ensureLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream;
    return localStream;
  } catch (e) {
    alert("Разреши доступ к камере/микрофону");
    throw e;
  }
}

// WebRTC PeerConnection
function createPeerConnection() {
  const pcLocal = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pcLocal.onicecandidate = (e) => {
    if (e.candidate && currentTarget) {
      socket.emit("message", {
        type: "candidate",
        candidate: e.candidate,
        to: currentTarget,
        target: currentTarget,
        from: myId
      });
      log("Отправлен ICE");
    }
  };

  pcLocal.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
    log("Пришёл remote track");
  };

  pcLocal.onconnectionstatechange = () => {
    log("PC state:", pcLocal.connectionState);
  };

  return pcLocal;
}

// call
callBtn.onclick = async () => {
  const target = targetInput.value.trim();
  if (!target) return alert("Введите ID собеседника");

  currentTarget = target;

  try {
    await ensureLocalStream();
    pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("message", {
      type: "offer",
      offer,
      to: currentTarget,
      target: currentTarget,
      from: myId
    });

    log("Offer отправлен:", currentTarget);
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
  } catch (e) {
    log("Call error:", e);
  }
};

// accept
answerBtn.onclick = async () => {
  if (!incomingOffer) return alert("Нет входящего звонка");

  ringtone.pause(); ringtone.currentTime = 0;

  try {
    await ensureLocalStream();
    pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    await pc.setRemoteDescription(incomingOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("message", {
      type: "answer",
      answer,
      to: currentTarget,
      target: currentTarget,
      from: myId
    });

    log("Answer отправлен");
    incomingOffer = null;
  } catch (e) {
    log("Answer error:", e);
  }
};

// hangup
hangupBtn.onclick = () => {
  if (pc) pc.close();
  pc = null;
  currentTarget = null;
  incomingOffer = null;
  remoteVideo.srcObject = null;

  ringtone.pause();
  ringtone.currentTime = 0;

  log("Call ended");
};
