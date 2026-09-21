const jwt = require('jsonwebtoken');
const config = require('./config');

const TOKEN_TTL = '365d';

function signToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret); // throws on invalid/expired
}

module.exports = { signToken, verifyToken };
