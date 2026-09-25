// utils/messageStore.js
// In-memory chat history management

const MAX_HISTORY = 50;

// room -> array of message objects
const roomHistories = {
  general: [],
  developers: [],
  random: []
};

/**
 * Ensure a room's history bucket exists.
 */
function ensureRoom(room) {
  if (!roomHistories[room]) {
    roomHistories[room] = [];
  }
}

/**
 * Append a message to a room's history buffer, capped at MAX_HISTORY.
 */
function addMessageToHistory(room, messageObj) {
  ensureRoom(room);
  roomHistories[room].push(messageObj);
  if (roomHistories[room].length > MAX_HISTORY) {
    roomHistories[room].shift();
  }
  return messageObj;
}

/**
 * Get the history buffer for a room (creates it if missing).
 */
function getHistory(room) {
  ensureRoom(room);
  return roomHistories[room];
}

/**
 * List all known room names.
 */
function listRooms() {
  return Object.keys(roomHistories);
}

module.exports = {
  MAX_HISTORY,
  addMessageToHistory,
  getHistory,
  listRooms,
  ensureRoom
};
