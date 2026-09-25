# 💬 Assignment 13: Real-Time Group Chat & Messaging Engine (Socket.io)

**Author:** Pranav Nair 
**Tech Stack:** Node.js, Express.js, Socket.io, In-Memory History Store, CORS

A real-time group chat and direct messaging engine with multi-room support, typing indicators, live presence tracking, and message history hydration for new joiners.

## Features

- Multi-channel rooms (`#general`, `#developers`, `#random`) via `socket.join` / `socket.leave`
- Real-time group messaging broadcast to room members
- Private direct messages delivered only to the intended recipient socket
- Debounced typing indicators (`typing:start` / `typing:stop` → `typing:update`)
- Live online-user roster per room
- In-memory history buffer (last 50 messages per room), replayed to users on join

## Project structure

```
Pranav Nair/
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── sockets/
│   ├── chatHandler.js
│   └── userHandler.js
├── utils/
│   └── messageStore.js
├── server.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Setup

```bash
# Install dependencies
npm install

# Copy env file and adjust if needed
cp .env.example .env

# Run in development (auto-restart)
npm run dev

# Or run normally
npm start
```

The server starts at **http://localhost:5000** by default.

## Socket event protocol

### Session & room management

| Event | Direction | Payload | Description |
|---|---|---|---|
| `user:login` | Client → Server | `{ username, avatar }` | Registers user identity |
| `room:join` | Client → Server | `{ room }` | Joins a channel |
| `room:history` | Server → Client | `{ room, messages }` | Sends recent history on join |
| `room:userlist` | Server → Room | `{ room, users, userSockets }` | Broadcasts online users |
| `room:leave` | Client → Server | `{ room }` | Leaves a room |

### Messaging & indicators

| Event | Direction | Payload | Description |
|---|---|---|---|
| `chat:send` | Client → Server | `{ room, message }` | Sends a message to a room |
| `chat:receive` | Server → Room | `{ id, sender, message, timestamp }` | Broadcasts message |
| `typing:start` / `typing:stop` | Client → Server | `{ room }` | Typing state |
| `typing:update` | Server → Room | `{ username, isTyping }` | Notifies others of typing |
| `direct:send` | Client → Server | `{ recipientId, message }` | Sends a private message |
| `direct:receive` | Server → Client | `{ from, message, timestamp }` | Delivered to recipient only |

## Manual testing

1. Start the server (`npm run dev`).
2. Open three browser tabs and log in as three different usernames.
3. Join `#developers` with two of the tabs, and `#random` with the third.
4. Type in `#developers` from one tab — confirm only the other `#developers` tab sees the typing indicator.
5. Send a message — confirm it appears in real time for both `#developers` tabs but not `#random`.
6. Open a fourth tab and join `#developers` — confirm prior messages load instantly from history.
7. Click a user in the sidebar to open a DM and send a private message — confirm only that recipient receives it.

## Notes

- Chat history is stored in memory and resets when the server restarts.
- `userSockets` on `room:userlist` is a supplement to the documented protocol, used client-side to resolve a username to its current socket id for direct messaging.
