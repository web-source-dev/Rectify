const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('../config');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Destructive, one-click "clear everything" action. Wipes all chat messages
// and all media (DB rows + files on disk) but leaves User accounts alone so
// nobody gets logged out or has to re-enter their name.
router.post('/admin/wipe', requireAuth, async (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'confirmation_required' });
  }

  await prisma.$transaction([prisma.message.deleteMany(), prisma.media.deleteMany()]);

  await fsp.rm(config.uploadDir, { recursive: true, force: true }).catch(() => {});
  // media.js expects an uploads/tmp dir to already exist for in-flight uploads.
  await fsp.mkdir(path.join(config.uploadDir, 'tmp'), { recursive: true });

  const io = req.app.get('io');
  if (io) io.emit('data:wiped');

  res.json({ ok: true });
});

module.exports = router;
