const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const fs = require('fs');

const config = require('./config');
const { attachChat } = require('./sockets/chat');

fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();
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
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
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
