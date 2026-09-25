// server.js
// Express & Socket.io server bootstrap

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { registerUserHandlers, connectedUsers } = require("./sockets/userHandler");
const { registerChatHandlers } = require("./sockets/chatHandler");
const { listRooms } = require("./utils/messageStore");

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Simple health/status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    connectedUsers: connectedUsers.size,
    rooms: listRooms()
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  registerUserHandlers(io, socket);
  registerChatHandlers(io, socket);

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
