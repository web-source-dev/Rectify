const { verifyToken } = require('../auth-utils');
const prisma = require('../db');
const { createMessage } = require('../message-utils');
const { bindScreenShare, endScreenShareForSocket } = require('./screen');

// One person can have several sockets (phone chat, live capture, web).
// They count as online while any of those sockets are connected.
const online = new Map();

function presenceList() {
  return [...online.entries()].map(([userId, info]) => ({
    userId,
    name: info.name,
    online: true,
  }));
}

function sendPresence(socket) {
  socket.emit('presence:list', { users: presenceList() });
}

function noteUserName(io, userId, name) {
  const info = online.get(userId);
  if (!info) return;
  info.name = name;
  io.emit('presence:update', { userId, name, online: true });
}

function attachChat(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('unauthorized'));
    }
    try {
      const payload = verifyToken(token);
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    bindScreenShare(io, socket);

    socket.on('presence:sync', () => {
      sendPresence(socket);
    });

    prisma.user
      .findUnique({ where: { id: socket.userId } })
      .then((user) => {
        if (!user || !socket.connected) return;
        let info = online.get(user.id);
        const arrived = !info;
        if (!info) {
          info = { name: user.name, sockets: new Set() };
          online.set(user.id, info);
        }
        info.name = user.name;
        info.sockets.add(socket.id);
        sendPresence(socket);
        if (arrived) {
          io.emit('presence:update', { userId: user.id, name: user.name, online: true });
        }
      })
      .catch((err) => console.error('presence lookup failed:', err));

    socket.on('message:send', async (payload, ack) => {
      try {
        const { message, error } = await createMessage(socket.userId, payload);
        if (error) {
          if (typeof ack === 'function') ack({ error });
          return;
        }

        io.emit('message:new', message);
        if (typeof ack === 'function') ack({ ok: true, message });
      } catch (err) {
        console.error('message:send failed:', err);
        if (typeof ack === 'function') ack({ error: 'internal_error' });
      }
    });

    socket.on('disconnect', () => {
      endScreenShareForSocket(io, socket);
      const info = online.get(socket.userId);
      if (!info) return;
      info.sockets.delete(socket.id);
      if (info.sockets.size > 0) return;
      online.delete(socket.userId);
      io.emit('presence:update', { userId: socket.userId, name: info.name, online: false });
    });
  });
}

module.exports = { attachChat, noteUserName };
