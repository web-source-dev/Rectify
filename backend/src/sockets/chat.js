const { verifyToken } = require('../auth-utils');
const prisma = require('../db');

function serialize(message) {
  return {
    id: message.id,
    userId: message.userId,
    name: message.user ? message.user.name : null,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
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
    prisma.user.findUnique({ where: { id: socket.userId } }).then((user) => {
      if (user) {
        io.emit('presence:update', { userId: user.id, name: user.name, online: true });
      }
    });

    socket.on('message:send', async (payload, ack) => {
      const text = payload && typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!text || text.length > 2000) {
        if (typeof ack === 'function') ack({ error: 'text_invalid_length' });
        return;
      }

      const message = await prisma.message.create({
        data: { userId: socket.userId, text },
        include: { user: true },
      });

      const serialized = serialize(message);
      io.emit('message:new', serialized);
      if (typeof ack === 'function') ack({ ok: true, message: serialized });
    });

    socket.on('disconnect', () => {
      io.emit('presence:update', { userId: socket.userId, online: false });
    });
  });
}

module.exports = { attachChat };
