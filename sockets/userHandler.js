// sockets/userHandler.js
// Handles user identity, room join/leave and disconnects

const { getHistory, ensureRoom } = require("../utils/messageStore");

// socketId -> { username, avatar, currentRoom }
const connectedUsers = new Map();

/**
 * Build the list of usernames currently present in a given room.
 */
function getUsersInRoom(io, room) {
  const roomSockets = io.sockets.adapter.rooms.get(room);
  if (!roomSockets) return [];

  const users = [];
  roomSockets.forEach((socketId) => {
    const user = connectedUsers.get(socketId);
    if (user) users.push({ socketId, username: user.username });
  });
  return users;
}

/**
 * Broadcast the updated user list for a room to everyone in it.
 */
function broadcastRoomUserList(io, room) {
  const entries = getUsersInRoom(io, room);
  io.to(room).emit("room:userlist", {
    room,
    // Spec-compliant plain username list
    users: entries.map((e) => e.username),
    // Supplemental map so clients can resolve a username to a socket id,
    // needed to target `direct:send` at a specific recipient.
    userSockets: entries
  });
}

function registerUserHandlers(io, socket) {
  // user:login -> register identity and socket mapping
  socket.on("user:login", ({ username, avatar }) => {
    if (!username || typeof username !== "string") {
      socket.emit("error:message", { message: "A valid username is required." });
      return;
    }

    connectedUsers.set(socket.id, {
      username: username.trim(),
      avatar: avatar || "avatar1.png",
      currentRoom: null
    });

    socket.emit("user:login:ack", {
      socketId: socket.id,
      username: username.trim()
    });
  });

  // room:join -> join a chat channel
  socket.on("room:join", ({ room }) => {
    if (!room) return;
    const user = connectedUsers.get(socket.id);
    if (!user) {
      socket.emit("error:message", { message: "Please login before joining a room." });
      return;
    }

    // Leave previous room, if any
    if (user.currentRoom && user.currentRoom !== room) {
      socket.leave(user.currentRoom);
      broadcastRoomUserList(io, user.currentRoom);
    }

    ensureRoom(room);
    socket.join(room);
    user.currentRoom = room;
    connectedUsers.set(socket.id, user);

    // Send history buffer to the joining user
    socket.emit("room:history", {
      room,
      messages: getHistory(room)
    });

    // Update everyone's roster in that room
    broadcastRoomUserList(io, room);
  });

  // room:leave -> leave the current room
  socket.on("room:leave", ({ room }) => {
    if (!room) return;
    socket.leave(room);

    const user = connectedUsers.get(socket.id);
    if (user && user.currentRoom === room) {
      user.currentRoom = null;
      connectedUsers.set(socket.id, user);
    }

    broadcastRoomUserList(io, room);
  });

  // disconnect -> clean up presence and roster
  socket.on("disconnect", () => {
    const user = connectedUsers.get(socket.id);
    if (user && user.currentRoom) {
      const room = user.currentRoom;
      connectedUsers.delete(socket.id);
      broadcastRoomUserList(io, room);
    } else {
      connectedUsers.delete(socket.id);
    }
  });
}

module.exports = {
  registerUserHandlers,
  connectedUsers,
  getUsersInRoom,
  broadcastRoomUserList
};
