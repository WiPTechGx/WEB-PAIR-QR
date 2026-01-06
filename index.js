import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import qrRoute from './routes/qr.js';
import pairRoute from './routes/pair.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Increase event listeners
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 2000;

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

// Start server for local dev
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`
PGWIZ Session Server
====================
Server Running on http://localhost:${PORT}
QR Code: /qr
Pair Code: /pair or /code?number=XXX
`);
  });
}

// Export for Vercel
export default app;