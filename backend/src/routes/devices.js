const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Keep stored device strings short and drop empties; these come straight from
// the client so we never trust their length.
function clip(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// The mobile app calls this each time it's opened (once it has a session), so
// the dashboard can show which phone opened the app at which time.
router.post('/devices/open', requireAuth, async (req, res) => {
  const { brand, model, deviceName, platform, appVersion } = req.body || {};
  await prisma.deviceOpen.create({
    data: {
      userId: req.userId,
      brand: clip(brand, 60),
      model: clip(model, 80),
      deviceName: clip(deviceName, 80),
      platform: clip(platform, 40),
      appVersion: clip(appVersion, 20),
    },
  });
  res.status(201).json({ ok: true });
});

// Recent app opens, newest first — read by the web dashboard's device log.
router.get('/devices/opens', requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const opens = await prisma.deviceOpen.findMany({
    orderBy: { openedAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true } } },
  });
  res.json({
    opens: opens.map((o) => ({
      id: o.id,
      userId: o.userId,
      name: o.user?.name ?? null,
      brand: o.brand,
      model: o.model,
      deviceName: o.deviceName,
      platform: o.platform,
      appVersion: o.appVersion,
      openedAt: o.openedAt,
    })),
  });
});

module.exports = router;
