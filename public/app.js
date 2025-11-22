// app.js — WebSocket signaling + WebRTC client
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  // demo TURN (may be unreliable) — good for testing cross-network
  { urls: "turn:global.turn.twilio.com:3478?transport=udp", username: "demo", credential: "demo" }
];

// Use location.hostname so it works both when opened by IP or localhost (adb reverse -> localhost)
const socket = new WebSocket("wss://vortexmessengertest.run.place:3000");


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
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
  logEl.textContent = line + '\n' + logEl.textContent;
  console.log(...args);
}

socket.onopen = () => log("WS: connected");
socket.onclose = () => log("WS: closed");
socket.onerror = (e) => log("WS error", e);

socket.onmessage = async (ev) => {
  let msg;
  if (typeof ev.data === "string") {
    try { msg = JSON.parse(ev.data); } catch (e) { log("Bad JSON", ev.data); return; }
  } else { log("Non-string WS message", ev.data); return; }

  log("Message:", msg.type || msg);

  if (msg.type === "id") {
    myId = String(msg.id);
    myIdEl.textContent = myId;
    return;
  }

  // incoming offer
  if (msg.type === "offer" && String(msg.target) === myId) {
    currentTarget = String(msg.from);
    incomingOffer = msg.offer;
    log("Входящий вызов от", currentTarget);

    ringtone.currentTime = 0;
    ringtone.play().catch(()=> log("Рингтон заблокирован (нужен клик)"));
    return;
  }

  // answer to our offer
  if (msg.type === "answer" && String(msg.target) === myId) {
    if (!pc) { log("Нет pc при получении answer"); return; }
    await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
    log("Answer установлен");
    ringtone.pause(); ringtone.currentTime = 0;
    return;
  }

  // remote ICE candidate
  if (msg.type === "candidate" && String(msg.target) === myId) {
    if (pc && msg.candidate) {
      try { await pc.addIceCandidate(msg.candidate); log("Добавлен remote ICE"); }
      catch(e) { log("Ошибка addIceCandidate", e); }
    }
    return;
  }

  if (msg.type === "error") { log("Server error:", msg.message); }
};

async function ensureLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    localVideo.srcObject = localStream;
    log("Local media started");
    return localStream;
  } catch (e) {
    log("Ошибка getUserMedia:", e);
    alert("Нужен доступ к камере и микрофону (позволь в настройках).");
    throw e;
  }
}

function createPeerConnection() {
  const pcLocal = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pcLocal.onicecandidate = (e) => {
    if (e.candidate && currentTarget) {
      socket.send(JSON.stringify({ type: "candidate", candidate: e.candidate, to: currentTarget, target: currentTarget }));
      log("Sent local ICE candidate");
    }
  };

  pcLocal.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
    log("Remote track arrived");
  };

  pcLocal.onconnectionstatechange = () => {
    log("PC state:", pcLocal.connectionState);
    if (["disconnected","failed","closed"].includes(pcLocal.connectionState)) {
      log("PC closed/failed");
    }
  };

  return pcLocal;
}

// call
callBtn.onclick = async () => {
  const target = (targetInput.value || "").trim();
  if (!target) return alert("Введите ID собеседника");
  currentTarget = String(target);

  try {
    await ensureLocalStream();
    pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.send(JSON.stringify({ type:"offer", offer, to: currentTarget, target: currentTarget, from: myId }));
    log("Offer sent to", currentTarget);

    ringtone.currentTime = 0;
    ringtone.play().catch(()=> log("Рингтон заблокирован"));
  } catch (e) {
    log("Call error:", e);
  }
};

// accept incoming
answerBtn.onclick = async () => {
  if (!incomingOffer || !currentTarget) return alert("Нет входящего звонка");
  try {
    ringtone.pause(); ringtone.currentTime = 0;
    await ensureLocalStream();
    pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.send(JSON.stringify({ type:"answer", answer, to: currentTarget, target: currentTarget, from: myId }));
    log("Answer sent to", currentTarget);

    incomingOffer = null;
  } catch (e) {
    log("Answer error:", e);
  }
};

// hangup
hangupBtn.onclick = () => {
  if (pc) { pc.close(); pc = null; }
  currentTarget = null; incomingOffer = null; remoteVideo.srcObject = null;
  ringtone.pause(); ringtone.currentTime = 0;
  log("Call ended");
};
