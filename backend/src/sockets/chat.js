const { verifyToken } = require('../auth-utils');
const prisma = require('../db');
const { createMessage } = require('../message-utils');

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
    prisma.user
      .findUnique({ where: { id: socket.userId } })
      .then((user) => {
        if (user) {
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
      io.emit('presence:update', { userId: socket.userId, online: false });
    });
  });
}

module.exports = { attachChat };
