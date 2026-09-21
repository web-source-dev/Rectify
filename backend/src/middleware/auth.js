const { verifyToken } = require('../auth-utils');

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  if (req.query && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

module.exports = { requireAuth, extractToken };
