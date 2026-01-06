require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;
const { qrRoute, pairRoute } = require('./routes');
require('events').EventEmitter.defaultMaxListeners = 2000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/qr', qrRoute);
app.use('/code', pairRoute);

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 200,
    success: true,
    service: 'PGWIZ Session',
    timestamp: new Date().toISOString()
  });
});

// Download session by ID - accepts PGWIZ~FILEID#HASH format
app.get('/download', (req, res) => {
  const sessionId = req.query.id || '';

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required', example: '/download?id=PGWIZ~abc123#xyz' });
  }

  // Parse session ID to MEGA URL
  let megaUrl;
  if (sessionId.startsWith('PGWIZ~')) {
    const fileInfo = sessionId.replace('PGWIZ~', '');
    megaUrl = `https://mega.nz/file/${fileInfo}`;
  } else if (sessionId.includes('#')) {
    megaUrl = `https://mega.nz/file/${sessionId}`;
  } else {
    return res.status(400).json({ error: 'Invalid session ID format', expected: 'PGWIZ~FILEID#HASH' });
  }

  res.redirect(megaUrl);
});

// API endpoint to get download link without redirect
app.get('/api/session', (req, res) => {
  const sessionId = req.query.id || '';

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }

  let megaUrl;
  if (sessionId.startsWith('PGWIZ~')) {
    const fileInfo = sessionId.replace('PGWIZ~', '');
    megaUrl = `https://mega.nz/file/${fileInfo}`;
  } else if (sessionId.includes('#')) {
    megaUrl = `https://mega.nz/file/${sessionId}`;
  } else {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  res.json({
    sessionId: sessionId,
    downloadUrl: megaUrl,
    message: 'Click the download URL to get your creds.json file from MEGA'
  });
});

app.listen(PORT, () => {
  console.log(`
PGWIZ Session Server
====================
Server Running on http://localhost:${PORT}
QR Code: /qr
Pair Code: /pair or /code?number=XXX
Health: /health
`);
});