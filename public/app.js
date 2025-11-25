const socket = io();

// DOM
const yourIdEl = document.getElementById("yourId");
const chatList = document.getElementById("chatList");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const typingEl = document.getElementById("typing");
const globalChk = document.getElementById("globalChk");

let myId = null;

// Загрузка состояния глобального чата
const globalState = localStorage.getItem("globalChat") === "true";
globalChk.checked = globalState;

// Подсветка
if (globalState) {
    globalChk.parentElement.style.color = "#4caf50";
}

// Сохранение переключателя глобального чата
globalChk.addEventListener("change", () => {
    const state = globalChk.checked;
    localStorage.setItem("globalChat", state ? "true" : "false");

    if (state) {
        globalChk.parentElement.style.color = "#4caf50";
    } else {
        globalChk.parentElement.style.color = "";
    }
});

// Получение собственного номера
socket.on("your-id", (id) => {
    myId = id;
    yourIdEl.textContent = id;
});

sendMsgBtn.addEventListener("click", sendMessage);

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  socket.emit("chat-message", {
    type: "text",
    text,
    time: Date.now()
  });

  addMessage("Вы", text);

  msgInput.value = "";
}
function addMessage(from, text, isMe = false) {
    const box = document.createElement("div");
    box.className = "msg";

    box.innerHTML = `
        <div class="msg-from">${from}</div>
        <div class="msg-text">${text}</div>
    `;

    messages.appendChild(box);
    messages.scrollTop = messages.scrollHeight;
}

// Показ сообщения
function appendMessage(msg, self = false) {
    const div = document.createElement("div");
    div.className = "msg " + (self ? "self" : "");

    let html = `<b>${msg.from || "???"}:</b> `;

    if (msg.type === "text") {
        html += msg.text;
    } else if (msg.type === "image") {
        html += `<img src="${msg.url}" class="msg-img">`;
    } else if (msg.type === "file") {
        html += `<a href="${msg.url}" download>${msg.name}</a> (${Math.round(msg.size / 1024)} KB)`;
    }

    div.innerHTML = html;
    chatList.appendChild(div);
    chatList.scrollTop = chatList.scrollHeight;
}

// Отправка сообщения
sendBtn.addEventListener("click", () => {
    const text = msgInput.value.trim();
    if (!text) return;

    const payload = {
        type: "text",
        text,
        time: Date.now()
    };

    // Глобальный или личный
    if (!globalChk.checked) payload.to = prompt("Кому отправить? Введите номер:");

    socket.emit("chat-message", payload);
    appendMessage({ from: myId, ...payload }, true);

    msgInput.value = "";
});

// Отправка файла
fileInput.addEventListener("change", async () => {
    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/upload", {
        method: "POST",
        body: fd
    });

    const data = await res.json();
    if (!data.url) return;

    const payload = {
        type: data.mime.startsWith("image/") ? "image" : "file",
        url: data.url,
        name: data.name,
        size: data.size
    };

    if (!globalChk.checked) payload.to = prompt("Кому отправить? Введите номер:");

    socket.emit("chat-message", payload);
    appendMessage({ from: myId, ...payload }, true);
});

// Приём сообщений
socket.on("chat-message", (msg) => {
    appendMessage(msg, false);
});

// typing
let typingTimer;

msgInput.addEventListener("input", () => {
    socket.emit("typing", globalChk.checked ? {} : { to: prompt("Номер:") });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit("stop-typing", globalChk.checked ? {} : { to: prompt("Номер:") });
    }, 600);
});

socket.on("typing", (d) => {
    typingEl.textContent = d.from + " печатает...";
});
socket.on("stop-typing", () => {
    typingEl.textContent = "";
});


