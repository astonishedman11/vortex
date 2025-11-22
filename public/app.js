const socket = io(); // socket.io клиент

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

function log(msg) {
  logEl.textContent = msg + "\n" + logEl.textContent;
  console.log(msg);
}

// ---------- SOCKET EVENTS ----------

// получаем свой ID
socket.on("your-id", id => {
  myId = id;
  myIdEl.textContent = id;
  log("Ваш ID: " + id);
});

// входящий вызов
socket.on("call-made", async data => {
  incomingOffer = data.offer;
  currentTarget = data.socket;

  log("Входящий вызов от " + currentTarget);

  ringtone.currentTime = 0;
  ringtone.play().catch(() => {});
});

// ответ собеседника
socket.on("answer-made", async data => {
  if (!pc) return log("Нет peerConnection при answer");

  await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  log("Answer установлен");

  ringtone.pause();
  ringtone.currentTime = 0;
});

// ---------- WEBRTC ----------

async function ensureLocalStream() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;
  return localStream;
}

function createPeerConnection() {
  const pcLocal = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  });

  pcLocal.onicecandidate = e => {
    if (e.candidate && currentTarget) {
      socket.emit("ice-candidate", {
        candidate: e.candidate,
        to: currentTarget
      });
    }
  };

  pcLocal.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
    log("Получен remote track");
  };

  return pcLocal;
}

// ---------- BUTTONS ----------

// CALL
callBtn.onclick = async () => {
  const id = targetInput.value.trim();
  if (!id) return alert("Введите ID");

  currentTarget = id;

  await ensureLocalStream();
  pc = createPeerConnection();

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("call-user", {
    offer,
    to: id
  });

  log("Offer отправлен: " + id);

  ringtone.currentTime = 0;
  ringtone.play().catch(() => {});
};

// ANSWER
answerBtn.onclick = async () => {
  if (!incomingOffer || !currentTarget) return;

  ringtone.pause();
  ringtone.currentTime = 0;

  await ensureLocalStream();
  pc = createPeerConnection();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("make-answer", {
    answer,
    to: currentTarget
  });

  log("Answer отправлен");

  incomingOffer = null;
};

// HANG UP
hangupBtn.onclick = () => {
  if (pc) pc.close();
  pc = null;

  incomingOffer = null;
  currentTarget = null;
  remoteVideo.srcObject = null;

  ringtone.pause();
  ringtone.currentTime = 0;

  log("Разговор завершён");
};
