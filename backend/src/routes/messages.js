const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { serialize, createMessage } = require('../message-utils');

const router = express.Router();

router.get('/messages', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const before = req.query.before ? new Date(req.query.before) : null;

  const where = before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {};

  const rows = await prisma.message.findMany({
    where,
    include: { user: true, media: true },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  res.json({ messages: page.map(serialize), hasMore });
});

router.post('/messages', requireAuth, async (req, res) => {
  const { message, error } = await createMessage(req.userId, req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const io = req.app.get('io');
  if (io) io.emit('message:new', message);

  res.status(201).json(message);
});

module.exports = router;
