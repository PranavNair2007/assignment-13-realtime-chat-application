// sockets/chatHandler.js
// Handles room messaging, direct messages, and typing indicators

const { addMessageToHistory } = require("../utils/messageStore");
const { connectedUsers } = require("./userHandler");

// Debounce window (ms) after which a "typing" state auto-expires server-side
const TYPING_TIMEOUT_MS = 3000;

// socketId -> Timeout handle, used to auto-emit typing:stop if the client
// never sends one (e.g. tab closed abruptly)
const typingTimers = new Map();

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTimestamp() {
  const d = new Date();
  return d.toTimeString().slice(0, 5); // "HH:MM"
}

function registerChatHandlers(io, socket) {
  // chat:send -> broadcast a message to everyone in a room
  socket.on("chat:send", ({ room, message }) => {
    if (!room || !message || !message.trim()) return;

    const user = connectedUsers.get(socket.id);
    if (!user) {
      socket.emit("error:message", { message: "Please login before sending messages." });
      return;
    }

    const messageObj = {
      id: generateMessageId(),
      sender: user.username,
      message: message.trim(),
      timestamp: formatTimestamp()
    };

    addMessageToHistory(room, messageObj);
    io.to(room).emit("chat:receive", messageObj);
  });

  // typing:start -> notify others in the room
  socket.on("typing:start", ({ room }) => {
    if (!room) return;
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    socket.to(room).emit("typing:update", {
      username: user.username,
      isTyping: true
    });

    // Reset any existing auto-expire timer for this socket
    if (typingTimers.has(socket.id)) {
      clearTimeout(typingTimers.get(socket.id));
    }
    const timer = setTimeout(() => {
      socket.to(room).emit("typing:update", {
        username: user.username,
        isTyping: false
      });
      typingTimers.delete(socket.id);
    }, TYPING_TIMEOUT_MS);
    typingTimers.set(socket.id, timer);
  });

  // typing:stop -> notify others in the room immediately
  socket.on("typing:stop", ({ room }) => {
    if (!room) return;
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (typingTimers.has(socket.id)) {
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
    }

    socket.to(room).emit("typing:update", {
      username: user.username,
      isTyping: false
    });
  });

  // direct:send -> deliver a private message to one recipient socket
  socket.on("direct:send", ({ recipientId, message }) => {
    if (!recipientId || !message || !message.trim()) return;

    const sender = connectedUsers.get(socket.id);
    if (!sender) {
      socket.emit("error:message", { message: "Please login before sending messages." });
      return;
    }

    const recipientSocket = io.sockets.sockets.get(recipientId);
    if (!recipientSocket) {
      socket.emit("error:message", { message: "Recipient is no longer online." });
      return;
    }

    const payload = {
      from: sender.username,
      fromId: socket.id,
      message: message.trim(),
      timestamp: formatTimestamp()
    };

    io.to(recipientId).emit("direct:receive", payload);
    // Echo back to sender so their own UI can render the sent DM
    socket.emit("direct:receive", payload);
  });

  socket.on("disconnect", () => {
    if (typingTimers.has(socket.id)) {
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
    }
  });
}

module.exports = { registerChatHandlers };
