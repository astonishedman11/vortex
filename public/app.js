const socket = io();

// DOM
const yourIdEl = document.getElementById("yourId");
const msgInput = document.getElementById("msgInput");
const sendMsgBtn = document.getElementById("sendMsgBtn");
const messages = document.getElementById("messages");
const fileInput = document.getElementById("fileInput");
const typingEl = document.getElementById("typing");
const globalChk = document.getElementById("globalChk");

let myId = null;
let privateTarget = null; // сохраняем номер для личного чата

// ---------------------------
// Глобальный чат (load)
// ---------------------------
const globalState = localStorage.getItem("globalChat") === "true";
globalChk.checked = globalState;

if (globalState) {
    globalChk.parentElement.style.color = "#4caf50";
}

// ---------------------------
// Сохранение состояния глобального чата
// ---------------------------
globalChk.addEventListener("change", () => {
    const state = globalChk.checked;
    localStorage.setItem("globalChat", state ? "true" : "false");

    globalChk.parentElement.style.color = state ? "#4caf50" : "";
});

// ---------------------------
// Получение номера
// ---------------------------
socket.on("your-id", (id) => {
    myId = id;
    yourIdEl.textContent = id;
});

// ---------------------------
// Универсальная функция отображения сообщений
// ---------------------------
function appendMessage(msg, self = false) {
    const box = document.createElement("div");
    box.className = "msg" + (self ? " self" : "");

    let html = `<div class="msg-from">${msg.from}</div>`;

    if (msg.type === "text") {
        html += `<div class="msg-text">${msg.text}</div>`;
    } else if (msg.type === "image") {
        html += `<img src="${msg.url}" class="msg-img">`;
    } else if (msg.type === "file") {
        html += `<a href="${msg.url}" download>${msg.name}</a> (${Math.round(msg.size/1024)} KB)`;
    }

    box.innerHTML = html;
    messages.appendChild(box);
    messages.scrollTop = messages.scrollHeight;
}

// ---------------------------
// Отправка текста
// ---------------------------
sendMsgBtn.addEventListener("click", sendMessage);

function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;

    const payload = {
        type: "text",
        text,
        time: Date.now()
    };

    if (!globalChk.checked) {
        if (!privateTarget) {
            privateTarget = prompt("Введите номер собеседника:");
        }
        payload.to = privateTarget;
    }

    socket.emit("chat-message", payload);
    appendMessage({ from: myId, ...payload }, true);

    msgInput.value = "";
}

// ---------------------------
// Прием сообщений
// ---------------------------
socket.on("chat-message", (msg) => appendMessage(msg, false));

// ---------------------------
// Upload
// ---------------------------
fileInput.addEventListener("change", async () => {
    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/upload", { method: "POST", body: fd });
    const data = await res.json();

    const payload = {
        type: data.mime.startsWith("image/") ? "image" : "file",
        url: data.url,
        name: data.name,
        size: data.size
    };

    if (!globalChk.checked) {
        if (!privateTarget) privateTarget = prompt("Введите номер:");
        payload.to = privateTarget;
    }

    socket.emit("chat-message", payload);
    appendMessage({ from: myId, ...payload }, true);
});

// ---------------------------
// typing...
// ---------------------------
let typingTimer;

msgInput.addEventListener("input", () => {
    if (globalChk.checked) {
        socket.emit("typing", {});
    } else {
        if (!privateTarget) privateTarget = prompt("Введите номер собеседника:");
        socket.emit("typing", { to: privateTarget });
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        if (globalChk.checked) {
            socket.emit("stop-typing", {});
        } else {
            socket.emit("stop-typing", { to: privateTarget });
        }
    }, 600);
});

socket.on("typing", (d) => {
    typingEl.textContent = `${d.from} печатает...`;
});
socket.on("stop-typing", () => {
    typingEl.textContent = "";
});
