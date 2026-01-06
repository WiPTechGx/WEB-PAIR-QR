import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import qrRouter from './qr.js';
import pairRouter from './pair.js';
import loadRouter from './loadSession.js';

import crypto from 'crypto';

if (!global.crypto) {
    global.crypto = crypto.webcrypto;
}

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;

import('events').then(events => {
    events.EventEmitter.defaultMaxListeners = 500;
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.use('/qr', qrRouter);
app.use('/code', pairRouter);
app.use('/load', loadRouter);

app.use('/pair', async (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});
app.use('/qrpage', (req, res) => {
    res.sendFile(path.join(__dirname, 'qr.html'));
});
app.use('/', async (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

// Auto-load all saved sessions on startup
import fs from 'fs-extra';

const SESSIONS_ROOT = path.join(__dirname, 'sessions');

async function autoLoadSessions() {
    if (!fs.existsSync(SESSIONS_ROOT)) {
        console.log('📂 No sessions folder found. Skipping auto-load.');
        return;
    }

    const sessions = await fs.readdir(SESSIONS_ROOT);
    const validSessions = [];

    for (const sessionId of sessions) {
        const credsPath = path.join(SESSIONS_ROOT, sessionId, 'creds.json');
        if (fs.existsSync(credsPath)) {
            validSessions.push(sessionId);
        }
    }

    if (validSessions.length === 0) {
        console.log('📂 No valid sessions found to auto-load.');
        return;
    }

    console.log(`🚀 Auto-loading ${validSessions.length} saved session(s)...`);

    for (const sessionId of validSessions) {
        try {
            // Hit the /load endpoint internally to load each session
            const response = await fetch(`http://localhost:${PORT}/load?sessionId=${sessionId}`);
            const result = await response.json();
            console.log(`   ✅ Loaded session: ${sessionId}`, result.message || '');
        } catch (err) {
            console.error(`   ❌ Failed to load session ${sessionId}:`, err.message);
        }
    }

    console.log('🎉 Auto-load complete!');
}

app.listen(PORT, async () => {
    console.log(`YoutTube: @GlobalTechInfo\nGitHub: @GlobalTechInfo\nServer running on http://localhost:${PORT}`);

    // Wait a moment for server to be ready, then auto-load sessions
    setTimeout(autoLoadSessions, 2000);
});

export default app;
