require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;
const {
  qrRoute,
  pairRoute
} = require('./routes');
require('events').EventEmitter.defaultMaxListeners = 2000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


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

app.listen(PORT, () => {
  console.log(`
PGWIZ Session Server
====================
Server Running on http://localhost:` + PORT + `
QR Code: /qr
Pair Code: /pair or /code?number=XXX
`)
})

module.exports = app