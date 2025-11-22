const socket = io();

let myId = null;
let targetId = null;

let peerConnection = null;
let localStream = null;

// ICE кандидаты, пришедшие раньше времени
let pendingCandidates = [];

// STUN сервер
const config = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] }
  ]
};

// UI элементы
const myIdEl = document.getElementById("myId");
const targetIdEl = document.getElementById("targetId");
const callBtn = document.getElementById("callBtn");
const answerBtn = document.getElementById("answerBtn");
const hangupBtn = document.getElementById("hangupBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const ringtone = document.getElementById("ringtone");

function log(msg) {
  console.log(msg);
}

// 🔥 Создаем RTCPeerConnection
async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  // отправка ICE кандидатов
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        to: targetId,
        candidate: event.candidate
      });
    }
  };

  // получение удалённого видео
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // добавляем локальные треки
  localStream.getTracks().forEach((t) => {
    peerConnection.addTrack(t, localStream);
  });

  // применяем сохранённые ICE кандидаты
  pendingCandidates.forEach(c => {
    peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
  });
  pendingCandidates = [];
}

// получение ID
socket.on("your-id", (id) => {
  myId = id;
  myIdEl.textContent = id;
});

// Входящий ICE кандидат
socket.on("ice-candidate", (data) => {
  if (!peerConnection) {
    console.warn("🎈 PC ещё нет — кандидат в буфер");
    pendingCandidates.push(data.candidate);
    return;
  }

  peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
    .catch(err => console.error("ICE Error:", err));
});

// входящий вызов
socket.on("call-made", async (data) => {
  ringtone.play();

  targetId = data.socket;

  await createPeerConnection();

  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("make-answer", {
    answer,
    to: data.socket
  });
});

// ответ на вызов
socket.on("answer-made", async (data) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

// Кнопка — позвонить
callBtn.onclick = async () => {
  targetId = targetIdEl.value.trim();

  if (!targetId) return alert("Введите ID собеседника");

  // включаем камеру + микрофон
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  localVideo.srcObject = localStream;

  await createPeerConnection();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("call-user", {
    offer,
    to: targetId
  });
};

// Кнопка — принять
answerBtn.onclick = () => {
  ringtone.pause();
  ringtone.currentTime = 0;
};

// Кнопка — сброс
hangupBtn.onclick = () => {
  ringtone.pause();
  ringtone.currentTime = 0;

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  remoteVideo.srcObject = null;
};
