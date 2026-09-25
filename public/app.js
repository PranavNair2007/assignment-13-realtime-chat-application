// public/app.js
// Client socket event listeners & UI updates

const socket = io();

let currentUsername = null;
let currentAvatar = "🦊";
let currentRoom = "general";
let typingTimeout = null;
let onlineUsers = []; // last known userlist for current room (usernames)
let activeDmRecipient = null; // { socketId, username }
const dmThreads = new Map(); // socketId -> [{from, message, timestamp}]
const socketIdByUsername = new Map(); // best-effort mapping for DM clicks

// ---------- DOM refs ----------

const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");
const usernameInput = document.getElementById("username-input");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const avatarPicker = document.getElementById("avatar-picker");

const roomList = document.getElementById("room-list");
const roomTitle = document.getElementById("room-title");
const roomSub = document.getElementById("room-sub");
const messagesEl = document.getElementById("messages");
const typingIndicator = document.getElementById("typing-indicator");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");

const selfAvatar = document.getElementById("self-avatar");
const selfUsername = document.getElementById("self-username");

const userList = document.getElementById("user-list");
const onlineCount = document.getElementById("online-count");

const dmModal = document.getElementById("dm-modal");
const dmTitle = document.getElementById("dm-title");
const dmMessages = document.getElementById("dm-messages");
const dmInput = document.getElementById("dm-input");
const dmSend = document.getElementById("dm-send");
const dmClose = document.getElementById("dm-close");

// ---------- Login ----------

avatarPicker.addEventListener("click", (e) => {
  const opt = e.target.closest(".avatar-opt");
  if (!opt) return;
  document.querySelectorAll(".avatar-opt").forEach((el) => el.classList.remove("selected"));
  opt.classList.add("selected");
  currentAvatar = opt.dataset.avatar;
});

function doLogin() {
  const name = usernameInput.value.trim();
  if (!name) {
    loginError.textContent = "Please enter a username.";
    return;
  }
  loginError.textContent = "";
  currentUsername = name;
  socket.emit("user:login", { username: name, avatar: currentAvatar });
}

loginBtn.addEventListener("click", doLogin);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

socket.on("user:login:ack", ({ username }) => {
  loginScreen.style.display = "none";
  app.classList.add("active");
  selfUsername.textContent = username;
  selfAvatar.textContent = currentAvatar;
  socket.emit("room:join", { room: currentRoom });
});

socket.on("error:message", ({ message }) => {
  loginError.textContent = message;
});

// ---------- Room switching ----------

roomList.addEventListener("click", (e) => {
  const item = e.target.closest(".room-item");
  if (!item) return;
  const room = item.dataset.room;
  if (room === currentRoom) return;

  socket.emit("room:leave", { room: currentRoom });
  currentRoom = room;
  updateActiveRoomUI();
  socket.emit("room:join", { room: currentRoom });
});

function updateActiveRoomUI() {
  document.querySelectorAll(".room-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.room === currentRoom);
  });
  roomTitle.textContent = `#${currentRoom}`;
  messageInput.placeholder = `Message #${currentRoom}`;
  typingIndicator.textContent = "";
}
updateActiveRoomUI();

// ---------- History + incoming messages ----------

socket.on("room:history", ({ room, messages }) => {
  if (room !== currentRoom) return;
  messagesEl.innerHTML = "";
  if (messages.length === 0) {
    appendSystemNote(`No messages yet in #${room}. Say hello 👋`);
  }
  messages.forEach(renderMessage);
  roomSub.textContent = `${messages.length} recent message${messages.length === 1 ? "" : "s"}`;
  scrollToBottom();
});

socket.on("chat:receive", (msg) => {
  // Only render if it's for the room we're currently viewing.
  // (Server broadcasts to the room channel, and we only listen while joined,
  // but a stale event right after switching rooms is possible — guard anyway.)
  renderMessage(msg);
  scrollToBottom();
});

function renderMessage(msg) {
  const div = document.createElement("div");
  const isSelf = msg.sender === currentUsername;
  div.className = `msg ${isSelf ? "self" : ""}`;
  div.innerHTML = `
    <div class="meta">${escapeHtml(msg.sender)} · ${msg.timestamp}</div>
    <div>${escapeHtml(msg.message)}</div>
  `;
  messagesEl.appendChild(div);
}

function appendSystemNote(text) {
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = text;
  messagesEl.appendChild(div);
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- Sending messages ----------

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit("chat:send", { room: currentRoom, message: text });
  socket.emit("typing:stop", { room: currentRoom });
  messageInput.value = "";
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// ---------- Typing indicators ----------

messageInput.addEventListener("input", () => {
  socket.emit("typing:start", { room: currentRoom });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("typing:stop", { room: currentRoom });
  }, 1500);
});

socket.on("typing:update", ({ username, isTyping }) => {
  if (isTyping) {
    typingIndicator.textContent = `${username} is typing…`;
  } else if (typingIndicator.textContent.startsWith(username)) {
    typingIndicator.textContent = "";
  }
});

// ---------- Room presence / user list ----------

socket.on("room:userlist", ({ room, users, userSockets }) => {
  if (room !== currentRoom) return;
  onlineUsers = users;
  onlineCount.textContent = users.length;

  if (userSockets) {
    userSockets.forEach(({ socketId, username }) => {
      socketIdByUsername.set(username, socketId);
    });
  }

  userList.innerHTML = "";
  users.forEach((username) => {
    const isMe = username === currentUsername;
    const div = document.createElement("div");
    div.className = `user-item ${isMe ? "me" : ""}`;
    div.innerHTML = `<span class="dot"></span><span>${escapeHtml(username)}${isMe ? " (you)" : ""}</span>`;
    if (!isMe) {
      div.addEventListener("click", () => openDmComposer(username));
    }
    userList.appendChild(div);
  });
});

// ---------- Direct messages ----------
// The server's `direct:send` targets a recipient by socket id. We resolve
// username -> socket id from the `userSockets` field on `room:userlist`.

socket.on("direct:receive", (payload) => {
  const key = payload.fromId || activeDmRecipient?.socketId || payload.from;
  if (payload.fromId) socketIdByUsername.set(payload.from, payload.fromId);

  if (!dmThreads.has(key)) dmThreads.set(key, []);
  dmThreads.get(key).push(payload);

  if (activeDmRecipient && (activeDmRecipient.socketId === payload.fromId || activeDmRecipient.username === payload.from)) {
    renderDmThread(activeDmRecipient.socketId || key);
  }
});

function openDmComposer(username) {
  const socketId = socketIdByUsername.get(username);
  activeDmRecipient = { socketId, username };
  dmTitle.textContent = `DM · ${username}`;
  dmModal.classList.add("active");
  renderDmThread(socketId || username);
  dmInput.focus();

  if (!socketId) {
    dmMessages.innerHTML = "";
    appendDmSystemNote(
      `Waiting for a message from ${username} to establish a connection, or send one below once they've messaged you first.`
    );
  }
}

function renderDmThread(key) {
  dmMessages.innerHTML = "";
  const thread = dmThreads.get(key) || [];
  thread.forEach((m) => {
    const div = document.createElement("div");
    const isSelf = m.from === currentUsername;
    div.className = `msg ${isSelf ? "self" : ""}`;
    div.innerHTML = `<div class="meta">${escapeHtml(m.from)} · ${m.timestamp}</div><div>${escapeHtml(m.message)}</div>`;
    dmMessages.appendChild(div);
  });
  dmMessages.scrollTop = dmMessages.scrollHeight;
}

function appendDmSystemNote(text) {
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = text;
  dmMessages.appendChild(div);
}

dmSend.addEventListener("click", sendDm);
dmInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendDm();
});

function sendDm() {
  const text = dmInput.value.trim();
  if (!text || !activeDmRecipient) return;

  if (!activeDmRecipient.socketId) {
    appendDmSystemNote("Can't send yet — no active connection to this user.");
    return;
  }

  socket.emit("direct:send", { recipientId: activeDmRecipient.socketId, message: text });
  dmInput.value = "";
}

dmClose.addEventListener("click", () => {
  dmModal.classList.remove("active");
  activeDmRecipient = null;
});

window.addEventListener("beforeunload", () => {
  socket.emit("room:leave", { room: currentRoom });
});
