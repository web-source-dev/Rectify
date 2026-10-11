const prisma = require('../db');

// Live screen shares for people who are signed in to the chat.
// Frames are relayed to viewers and are not stored.
const shares = new Map();

const SHARE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_FRAME_CHARS = 900_000;
const MIN_FRAME_GAP_MS = 300;
const MAX_WATCHERS = 8;

function validShareId(id) {
  return typeof id === 'string' && SHARE_ID.test(id);
}

function serialize(share, forSocketId) {
  return {
    shareId: share.shareId,
    userId: share.userId,
    name: share.name,
    self: share.socketId === forSocketId,
  };
}

function emitViewerCount(io, share) {
  io.to(share.socketId).emit('screen:viewers', {
    shareId: share.shareId,
    count: share.watchers.size,
  });
}

function sendShareList(socket) {
  socket.emit('screen:list', {
    shares: [...shares.values()].map((share) => serialize(share, socket.id)),
  });
}

function endScreenShareForSocket(io, socket) {
  for (const share of shares.values()) {
    if (share.watchers.delete(socket.id)) {
      emitViewerCount(io, share);
    }
  }
  for (const [shareId, share] of [...shares.entries()]) {
    if (share.socketId === socket.id) {
      shares.delete(shareId);
      io.emit('screen:ended', { shareId });
    }
  }
}

function bindScreenShare(io, socket) {
  socket.on('screen:sync', () => {
    sendShareList(socket);
  });

  socket.on('screen:start', async (payload, ack) => {
    try {
      const shareId = payload && payload.shareId;
      if (!validShareId(shareId)) {
        if (typeof ack === 'function') ack({ error: 'bad_share' });
        return;
      }

      for (const [id, existing] of [...shares.entries()]) {
        if (existing.socketId === socket.id && id !== shareId) {
          shares.delete(id);
          io.emit('screen:ended', { shareId: id });
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { name: true },
      });
      const share = {
        shareId,
        userId: socket.userId,
        name: (user && user.name) || 'Someone',
        socketId: socket.id,
        watchers: new Set(),
        lastFrameAt: 0,
      };
      shares.set(shareId, share);

      const announcement = serialize(share, socket.id);
      socket.emit('screen:available', announcement);
      socket.broadcast.emit('screen:available', { ...announcement, self: false });
      socket.emit('screen:viewers', { shareId, count: 0 });
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      console.error('screen:start failed:', err);
      if (typeof ack === 'function') ack({ error: 'internal_error' });
    }
  });

  socket.on('screen:watch', (payload) => {
    const shareId = payload && payload.shareId;
    const share = validShareId(shareId) ? shares.get(shareId) : null;
    if (!share || share.socketId === socket.id) return;
    if (share.watchers.size >= MAX_WATCHERS && !share.watchers.has(socket.id)) return;
    share.watchers.add(socket.id);
    emitViewerCount(io, share);
  });

  socket.on('screen:unwatch', (payload) => {
    const shareId = payload && payload.shareId;
    const share = validShareId(shareId) ? shares.get(shareId) : null;
    if (!share) return;
    if (share.watchers.delete(socket.id)) {
      emitViewerCount(io, share);
    }
  });

  socket.on('screen:frame', (payload) => {
    const shareId = payload && payload.shareId;
    const frame = payload && payload.frame;
    const share = validShareId(shareId) ? shares.get(shareId) : null;
    if (!share || share.socketId !== socket.id) return;
    if (typeof frame !== 'string' || frame.length < 32 || frame.length > MAX_FRAME_CHARS) return;
    if (!frame.startsWith('/9j/')) return;
    const now = Date.now();
    if (now - share.lastFrameAt < MIN_FRAME_GAP_MS) return;
    share.lastFrameAt = now;
    if (share.watchers.size === 0) return;
    const message = { shareId, frame };
    for (const watcherId of share.watchers) {
      io.to(watcherId).emit('screen:frame', message);
    }
  });

  socket.on('screen:stop', (payload) => {
    const shareId = payload && payload.shareId;
    const share = validShareId(shareId) ? shares.get(shareId) : null;
    if (!share || share.socketId !== socket.id) return;
    shares.delete(shareId);
    io.emit('screen:ended', { shareId });
  });
}

module.exports = { bindScreenShare, endScreenShareForSocket };
