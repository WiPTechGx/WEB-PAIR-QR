import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const SESSIONS_ROOT = path.join(__dirname, 'sessions');

// Store active sockets by sessionId
const activeSockets = new Map();

router.get('/', async (req, res) => {
    const sessionId = req.query.sessionId;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    const sessionDir = path.join(SESSIONS_ROOT, sessionId);
    const credsFile = path.join(sessionDir, 'creds.json');

    // Check if session exists locally
    if (!fs.existsSync(credsFile)) {
        return res.status(404).json({
            error: 'Session not found',
            message: `No session found for ID: ${sessionId}. Generate a new session first.`
        });
    }

    // Check if already active
    if (activeSockets.has(sessionId)) {
        const existing = activeSockets.get(sessionId);
        if (existing.sock?.user) {
            return res.json({
                message: 'Session already active',
                sessionId,
                user: existing.sock.user
            });
        }
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            printQRInTerminal: false,
            markOnlineOnConnect: false,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            console.log(`[${sessionId}] Connection update: ${connection}`);

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    console.log(`[${sessionId}] Session logged out. Removing from active sockets.`);
                    activeSockets.delete(sessionId);
                } else {
                    // Reconnect
                    console.log(`[${sessionId}] Connection closed (${statusCode}). Reconnecting...`);
                    setTimeout(async () => {
                        try {
                            const newState = await useMultiFileAuthState(sessionDir);
                            const newSock = makeWASocket({
                                version,
                                auth: {
                                    creds: newState.state.creds,
                                    keys: makeCacheableSignalKeyStore(newState.state.keys, pino({ level: 'fatal' })),
                                },
                                logger: pino({ level: 'silent' }),
                                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                                printQRInTerminal: false,
                                markOnlineOnConnect: false,
                            });
                            newSock.ev.on('creds.update', newState.saveCreds);
                            activeSockets.set(sessionId, { sock: newSock });
                        } catch (err) {
                            console.error(`[${sessionId}] Reconnect failed:`, err);
                        }
                    }, 2000);
                }
            }

            if (connection === 'open') {
                console.log(`[${sessionId}] Session connected successfully!`);
            }
        });

        activeSockets.set(sessionId, { sock });

        res.json({
            message: 'Session loaded and connecting...',
            sessionId,
            status: 'connecting'
        });

    } catch (err) {
        console.error(`[${sessionId}] Error loading session:`, err);
        res.status(500).json({ error: 'Failed to load session', details: err.message });
    }
});

// List all available sessions
router.get('/list', async (req, res) => {
    try {
        if (!fs.existsSync(SESSIONS_ROOT)) {
            return res.json({ sessions: [] });
        }
        const sessions = await fs.readdir(SESSIONS_ROOT);
        const sessionDetails = [];

        for (const sessionId of sessions) {
            const metaPath = path.join(SESSIONS_ROOT, sessionId, 'meta.json');
            const credsPath = path.join(SESSIONS_ROOT, sessionId, 'creds.json');

            if (fs.existsSync(credsPath)) {
                let meta = null;
                if (fs.existsSync(metaPath)) {
                    meta = await fs.readJson(metaPath);
                }
                sessionDetails.push({
                    sessionId,
                    hasCredentials: true,
                    megaUrl: meta?.megaUrl || null,
                    createdAt: meta?.createdAt || null,
                    isActive: activeSockets.has(sessionId)
                });
            }
        }

        res.json({ sessions: sessionDetails });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list sessions', details: err.message });
    }
});

// Get session status
router.get('/status', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId required' });
    }

    const isActive = activeSockets.has(sessionId);
    const sock = activeSockets.get(sessionId)?.sock;

    res.json({
        sessionId,
        isActive,
        user: sock?.user || null
    });
});

export default router;
