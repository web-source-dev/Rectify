const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/users/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ id: user.id, name: user.name });
});

router.patch('/users/me', requireAuth, async (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'name_required' });
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    return res.status(400).json({ error: 'name_invalid_length' });
  }

  const existing = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!existing) {
    return res.status(404).json({ error: 'not_found' });
  }
  if (existing.name) {
    return res.status(409).json({ error: 'name_already_set' });
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { name: trimmed },
  });

  res.json({ id: user.id, name: user.name });
});

router.get('/users', requireAuth, async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ users: users.map((u) => ({ id: u.id, name: u.name })) });
});

module.exports = router;
