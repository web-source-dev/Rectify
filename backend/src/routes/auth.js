const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const prisma = require('../db');
const { signToken, verifyToken } = require('../auth-utils');

const router = express.Router();

// Hashed once at boot; the plaintext PIN only ever lives in the env var.
const pinHash = bcrypt.hashSync(config.familyPin, 12);

// A few family members, each on a couple of devices, mistyping a 4-digit PIN adds up
// fast — 10/15min was tripping on normal use. This still makes brute-forcing the PIN
// impractical (30 guesses / 15min against up to 10,000 combinations) while giving real
// usage enough headroom.
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

router.post('/auth/pin', pinLimiter, async (req, res) => {
  const { pin, token: existingToken } = req.body || {};
  if (typeof pin !== 'string' || pin.length === 0) {
    return res.status(400).json({ error: 'pin_required' });
  }

  const valid = bcrypt.compareSync(pin, pinHash);
  if (!valid) {
    return res.status(401).json({ error: 'invalid_pin' });
  }

  // A device that already has a session (e.g. re-entering the PIN after
  // it locked) keeps its identity and chosen name instead of getting a
  // brand new anonymous user every time.
  let user = null;
  if (typeof existingToken === 'string' && existingToken) {
    try {
      const payload = verifyToken(existingToken);
      user = await prisma.user.findUnique({ where: { id: payload.userId } });
    } catch {
      user = null;
    }
  }

  if (!user) {
    user = await prisma.user.create({ data: { name: null } });
  }

  const token = signToken(user.id);

  res.json({ token, user: { id: user.id, name: user.name } });
});

module.exports = router;
