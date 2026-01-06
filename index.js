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

// Download session by ID - downloads from MEGA and serves file directly
app.get('/download', async (req, res) => {
  const { File } = require('megajs');
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

  try {
    console.log('Downloading from MEGA:', megaUrl);
    const file = File.fromURL(megaUrl);

    // Load file attributes
    await file.loadAttributes();

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="creds.json"`);

    // Stream file directly to response
    const stream = file.download();
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('Download stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (err) {
    console.error('MEGA download error:', err);
    res.status(500).json({ error: 'Failed to download from MEGA', details: err.message });
  }
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