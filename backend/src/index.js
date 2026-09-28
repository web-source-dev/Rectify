const express = require('express');
require('./async-errors');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const fs = require('fs');

const config = require('./config');
const { attachChat } = require('./sockets/chat');

fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();
// In production the app sits behind one Nginx reverse proxy. Trusting that one
// hop lets Express read the real client IP from X-Forwarded-For, which the PIN
// rate limiter needs to tell devices apart (without it, every request looks
// like it comes from Nginx and express-rate-limit logs a validation error).
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', require('./routes/health'));
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/messages'));
app.use('/api', require('./routes/media'));
app.use('/api', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Client mistakes flagged by middleware (e.g. malformed JSON → 400) keep
  // their status instead of being reported as a server error.
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'bad_request' });
  }
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  if (res.headersSent) {
    return res.end();
  }
  res.status(500).json({ error: 'internal_error' });
});

// Safety net: log a stray rejected promise instead of crashing the server.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin },
  maxHttpBufferSize: 2 * 1024 * 1024,
});
app.set('io', io);

attachChat(io);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Family backend listening on :${config.port}`);
});
