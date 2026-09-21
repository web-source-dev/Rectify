const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serialize(message) {
  return {
    id: message.id,
    userId: message.userId,
    name: message.user ? message.user.name : null,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

router.get('/messages', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const before = req.query.before ? new Date(req.query.before) : null;

  const where = before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {};

  const rows = await prisma.message.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  res.json({ messages: page.map(serialize), hasMore });
});

router.post('/messages', requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'text_required' });
  }
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    return res.status(400).json({ error: 'text_invalid_length' });
  }

  const message = await prisma.message.create({
    data: { userId: req.userId, text: trimmed },
    include: { user: true },
  });

  const payload = serialize(message);

  const io = req.app.get('io');
  if (io) io.emit('message:new', payload);

  res.status(201).json(payload);
});

module.exports = router;
