// ============================================================================
// Nuvio Watch Party — Zero-Dependency Real-Time Coordination Server
// Supports: Samsung Smart TV (Tizen Native), Android Mobile, Web, and Desktop
// Runs on: Node.js (Linux, macOS, Windows, Android Termux, Raspberry Pi, Docker)
// RAM Usage: < 15 MB | CPU Usage: < 0.1% | Dependencies: ZERO (pure standard library)
// ============================================================================

import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";

const PORT = parseInt(process.env.PORT || process.env.WATCH_PARTY_PORT || "8089", 10);
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// In-memory room store: roomId -> RoomState
// RoomState: { roomId, leaderId, mediaId, state, timeMs, lastEpoch, clients: Set<Client> }
const rooms = new Map();

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const localIp = getLocalIp();

export function getOrCreateRoom(roomId) {
  const id = (roomId || "NUVIO1").toUpperCase().trim();
  if (!rooms.has(id)) {
    rooms.set(id, {
      roomId: id,
      leaderId: null,
      mediaId: "",
      state: "paused",
      timeMs: 0,
      lastEpoch: Date.now(),
      clients: new Set()
    });
  }
  return rooms.get(id);
}

export function broadcastToRoom(room, message, exceptSocket = null) {
  const payload = typeof message === "string" ? message : JSON.stringify(message);
  for (const client of room.clients) {
    if (client.socket !== exceptSocket && client.socket.writable) {
      sendWsText(client.socket, payload);
    }
  }
}

export function sendWsText(socket, text) {
  const buf = Buffer.from(text, "utf8");
  let header;
  if (buf.length < 126) {
    header = Buffer.from([0x81, buf.length]);
  } else if (buf.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(buf.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(buf.length), 2);
  }
  try {
    socket.write(Buffer.concat([header, buf]));
  } catch (_) {}
}

export function parseWsFrames(socket, onMessage, onClose) {
  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        len = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskKeyLen = masked ? 4 : 0;
      const totalLen = offset + maskKeyLen + len;
      if (buffer.length < totalLen) return;

      let payload = buffer.subarray(offset + maskKeyLen, totalLen);
      if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) {
          unmasked[i] = payload[i] ^ mask[i % 4];
        }
        payload = unmasked;
      }

      buffer = buffer.subarray(totalLen);

      if (opcode === 0x8) {
        // Connection close
        if (onClose) onClose();
        socket.end();
        return;
      } else if (opcode === 0x9) {
        // Ping -> Pong
        socket.write(Buffer.from([0x8a, 0x00]));
      } else if (opcode === 0x1) {
        // Text message
        if (onMessage) onMessage(payload.toString("utf8"));
      }
    }
  });

  socket.on("close", () => { if (onClose) onClose(); });
  socket.on("error", () => { if (onClose) onClose(); });
}

export function handleClientMessage(client, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch (_) {
    return;
  }

  const room = client.room;
  if (!room && msg.type !== "join") return;

  switch (msg.type) {
    case "join": {
      const targetRoom = getOrCreateRoom(msg.room || "NUVIO1");
      client.room = targetRoom;
      client.userId = msg.userId || ("user_" + Math.random().toString(36).substring(2, 8));
      client.userName = msg.userName || client.userId;
      client.isLeader = !!msg.isLeader;
      targetRoom.clients.add(client);

      if (!targetRoom.leaderId) {
        targetRoom.leaderId = client.userId;
      }

      console.log(`[Watch Party] User '${client.userName}' (${client.userId}) joined room '${targetRoom.roomId}' (${targetRoom.clients.size} active)`);

      // Send initial room snapshot to joining user
      sendWsText(client.socket, JSON.stringify({
        type: "room_state",
        room: targetRoom.roomId,
        leaderId: targetRoom.leaderId,
        isLeader: client.isLeader,
        mediaId: targetRoom.mediaId,
        state: targetRoom.state,
        timeMs: targetRoom.timeMs,
        participants: targetRoom.clients.size,
        epoch: targetRoom.lastEpoch
      }));

      // Broadcast join event to all other peers in room
      broadcastToRoom(targetRoom, {
        type: "user_joined",
        room: targetRoom.roomId,
        userId: client.userId,
        userName: client.userName,
        participants: targetRoom.clients.size
      }, client.socket);
      break;
    }

    case "sync": {
      if (room) {
        room.state = msg.state || room.state;
        room.timeMs = typeof msg.timeMs === "number" ? msg.timeMs : room.timeMs;
        room.mediaId = msg.mediaId || room.mediaId;
        room.lastEpoch = typeof msg.epoch === "number" ? msg.epoch : Date.now();

        // Broadcast to all other devices in the room with sub-second epoch timestamp
        broadcastToRoom(room, {
          type: "sync",
          room: room.roomId,
          state: room.state,
          timeMs: room.timeMs,
          mediaId: room.mediaId,
          originUserId: client.userId,
          epoch: room.lastEpoch
        }, client.socket);
      }
      break;
    }

    case "heartbeat": {
      if (room) {
        if (typeof msg.timeMs === "number") room.timeMs = msg.timeMs;
        if (msg.state) room.state = msg.state;
        room.lastEpoch = typeof msg.epoch === "number" ? msg.epoch : Date.now();

        broadcastToRoom(room, {
          type: "heartbeat",
          room: room.roomId,
          state: room.state,
          timeMs: room.timeMs,
          participants: room.clients.size,
          epoch: room.lastEpoch
        }, client.socket);
      }
      break;
    }

    case "leave": {
      if (room) {
        room.clients.delete(client);
        broadcastToRoom(room, {
          type: "user_left",
          room: room.roomId,
          userId: client.userId,
          participants: room.clients.size
        });
        if (room.clients.size === 0) {
          rooms.delete(room.roomId);
        }
      }
      break;
    }
  }
}

// HTTP Server: Serves Status Dashboard & Web Test Client
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.url === "/api/rooms") {
    const list = Array.from(rooms.values()).map(r => ({
      room: r.roomId,
      state: r.state,
      timeMs: r.timeMs,
      viewers: r.clients.size,
      lastUpdated: new Date(r.lastEpoch).toISOString()
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ activeRooms: list.length, rooms: list }));
    return;
  }

  // HTML Dashboard
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuvio Watch Party Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; max-width: 720px; margin: 0 auto; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    h1 { color: #58a6ff; margin-top: 0; display: flex; align-items: center; gap: 10px; font-size: 26px; }
    .badge { background: #238636; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: 700; }
    .url-box { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-family: monospace; font-size: 16px; color: #79c0ff; word-break: break-all; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .label { color: #8b949e; }
    .val { font-weight: 600; color: #f0f6fc; }
    .guide { margin-top: 24px; border-top: 1px solid #30363d; padding-top: 16px; font-size: 14px; line-height: 1.6; }
    code { background: #0d1117; padding: 2px 6px; border-radius: 4px; color: #f0883e; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🍿 Nuvio Watch Party <span class="badge">ONLINE</span></h1>
    <p>Zero-dependency real-time sync server for Samsung Smart TV and Android Mobile.</p>
    
    <div class="label">WebSocket Connection URL:</div>
    <div class="url-box">ws://${localIp}:${PORT}</div>

    <div class="row"><span class="label">Local Port:</span><span class="val">${PORT}</span></div>
    <div class="row"><span class="label">Host IP:</span><span class="val">${localIp}</span></div>
    <div class="row"><span class="label">Default Room:</span><span class="val">NUVIO1</span></div>

    <div class="guide">
      <h3>🚀 How to Connect</h3>
      <ul>
        <li><b>Samsung TV:</b> Press <b>Yellow</b> button (or <code>W</code> / <code>F4</code>) on your remote. The HUD will show Room <code>NUVIO1</code> and Server <code>ws://${localIp}:${PORT}</code>.</li>
        <li><b>Android Phone:</b> In the Nuvio player, tap the <b>Watch Party</b> icon in the top header, verify room code <code>NUVIO1</code>, and tap <b>Join Party</b>.</li>
        <li><b>Remote / Across Internet:</b> Expose port <code>${PORT}</code> with Cloudflare Tunnel (<code>npx cloudflared tunnel --url http://localhost:${PORT}</code>) and paste the <code>wss://...</code> URL on both devices!</li>
      </ul>
    </div>
  </div>
</body>
</html>`);
});

// WebSocket Protocol Handshake
server.on("upgrade", (req, socket) => {
  const wsKey = req.headers["sec-websocket-key"];
  if (!wsKey) {
    socket.destroy();
    return;
  }

  const hash = crypto
    .createHash("sha1")
    .update(wsKey + WS_GUID)
    .digest("base64");

  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${hash}`,
    "\r\n"
  ];

  socket.write(headers.join("\r\n"));

  const client = {
    socket,
    room: null,
    userId: null,
    userName: null,
    isLeader: false
  };

  parseWsFrames(
    socket,
    (msgText) => handleClientMessage(client, msgText),
    () => {
      if (client.room) {
        client.room.clients.delete(client);
        broadcastToRoom(client.room, {
          type: "user_left",
          room: client.room.roomId,
          userId: client.userId,
          participants: client.room.clients.size
        });
        if (client.room.clients.size === 0) {
          rooms.delete(client.room.roomId);
        }
      }
    }
  );
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("==========================================================");
  console.log("🍿 Nuvio Watch Party Coordination Server");
  console.log(`   Local URL:    http://localhost:${PORT}/`);
  console.log(`   Network WS:   ws://${localIp}:${PORT}`);
  console.log(`   Dashboard:    http://${localIp}:${PORT}/`);
  console.log("==========================================================");
});
