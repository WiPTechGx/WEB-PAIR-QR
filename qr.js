import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay
} from '@whiskeysockets/baileys';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const SESSIONS_ROOT = process.env.VERCEL
    ? path.join(os.tmpdir(), 'sessions')
    : path.join(__dirname, 'sessions');

// Track active sessions
const activeSessions = new Map();

// ============================================
// MINIMAL QR GENERATION - FOCUS ON LOGIN SUCCESS
// ============================================
router.get('/', async (req, res) => {
    let customId = req.query.sessionId || '';
    customId = customId.replace(/[^a-zA-Z0-9]/g, '');
    const randomID = Math.random().toString(36).substring(2, 6);
    const sessionId = customId ? `pgwiz-${customId}` : `pgwiz-${randomID}`;

    const dirs = path.join(SESSIONS_ROOT, sessionId);

    // Delete old session if exists (fresh start)
    if (fs.existsSync(dirs)) {
        console.log(`[${sessionId}] Removing old session...`);
        await fs.remove(dirs);
    }

    if (!fs.existsSync(SESSIONS_ROOT)) {
        await fs.mkdir(SESSIONS_ROOT, { recursive: true });
    }

    await fs.mkdir(dirs, { recursive: true });

    console.log(`[${sessionId}] Starting fresh session...`);

    // Initialize auth state
    const { state, saveCreds } = await useMultiFileAuthState(dirs);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[${sessionId}] Baileys version: ${version.join('.')}`);

    let qrSent = false;
    let loginSuccess = false;

    // MINIMAL CONFIG - Remove all optional settings
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        // That's it! No browser config, no timeouts, nothing fancy
    });

    // CRITICAL: Save creds on every update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        console.log(`[${sessionId}] Connection: ${connection}`);

        // Send QR to client
        if (qr) {
            try {
                const qrImage = await QRCode.toDataURL(qr);

                if (!qrSent) {
                    qrSent = true;
                    console.log(`[${sessionId}] ✅ QR Generated`);
                    res.json({
                        success: true,
                        sessionId,
                        qr: qrImage,
                        message: 'Scan this QR with WhatsApp'
                    });
                }
            } catch (err) {
                console.error(`[${sessionId}] QR Error:`, err);
            }
        }

        // Connection successful!
        if (connection === 'open') {
            console.log(`[${sessionId}] 🎉 LOGIN SUCCESS!`);
            loginSuccess = true;

            // Store active session
            activeSessions.set(sessionId, {
                sock,
                connectedAt: new Date().toISOString()
            });

            try {
                // Wait for connection to stabilize
                await delay(3000);

                // Get user ID from creds
                const credsPath = path.join(dirs, 'creds.json');
                const creds = await fs.readJson(credsPath);
                const userJid = creds.me.id;

                console.log(`[${sessionId}] Sending "Hi World" to ${userJid}...`);

                // Send "Hi World" message
                await sock.sendMessage(userJid, {
                    text: '👋 Hi World!\n\nYour WhatsApp bot is connected successfully!'
                });

                console.log(`[${sessionId}] ✅ Message sent!`);

            } catch (err) {
                console.error(`[${sessionId}] Error sending message:`, err);
            }
        }

        // Handle disconnection
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[${sessionId}] Disconnected. Code: ${statusCode}`);

            // If logged out, delete session
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`[${sessionId}] ❌ Logged out. Deleting session...`);
                await fs.remove(dirs);
                activeSessions.delete(sessionId);
                return;
            }

            // Auto-reconnect for other errors (only if login was successful)
            if (loginSuccess && shouldReconnect) {
                console.log(`[${sessionId}] Reconnecting...`);
                setTimeout(async () => {
                    try {
                        const { state: newState, saveCreds: newSave } = await useMultiFileAuthState(dirs);
                        const { version: newVersion } = await fetchLatestBaileysVersion();

                        const newSock = makeWASocket({
                            version: newVersion,
                            auth: newState,
                            printQRInTerminal: false,
                            logger: pino({ level: 'silent' }),
                        });

                        newSock.ev.on('creds.update', newSave);

                        // Update active session
                        activeSessions.set(sessionId, {
                            sock: newSock,
                            connectedAt: new Date().toISOString()
                        });

                        console.log(`[${sessionId}] Reconnected successfully`);
                    } catch (err) {
                        console.error(`[${sessionId}] Reconnect failed:`, err);
                    }
                }, 3000);
            }
        }
    });

    // Timeout if no QR in 60 seconds
    setTimeout(() => {
        if (!qrSent) {
            console.log(`[${sessionId}] ⏱️ Timeout`);
            if (!res.headersSent) {
                res.status(408).json({ error: 'QR generation timeout' });
            }
            sock.end(undefined);
        }
    }, 60000);
});

// ============================================
// LOAD EXISTING SESSION
// ============================================
router.get('/load', async (req, res) => {
    const sessionId = req.query.sessionId;

    if (!sessionId) {
        return res.status(400).json({
            error: 'Session ID required',
            usage: '/load?sessionId=pgwiz-xxx'
        });
    }

    const dirs = path.join(SESSIONS_ROOT, sessionId);
    const credsPath = path.join(dirs, 'creds.json');

    if (!fs.existsSync(credsPath)) {
        return res.status(404).json({
            error: 'Session not found',
            message: `No session exists for: ${sessionId}`
        });
    }

    // Check if already loaded
    if (activeSessions.has(sessionId)) {
        return res.json({
            success: true,
            message: 'Session already active',
            sessionId
        });
    }

    console.log(`[${sessionId}] Loading session...`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            console.log(`[${sessionId}] LOAD Connection: ${connection}`);

            if (connection === 'open') {
                console.log(`[${sessionId}] ✅ Session loaded!`);

                activeSessions.set(sessionId, {
                    sock,
                    connectedAt: new Date().toISOString()
                });

                try {
                    const creds = await fs.readJson(credsPath);
                    const userJid = creds.me.id;

                    await sock.sendMessage(userJid, {
                        text: `✅ Session \`${sessionId}\` loaded successfully!`
                    });
                } catch (e) {
                    console.error(`[${sessionId}] Message error:`, e.message);
                }

                if (!res.headersSent) {
                    res.json({
                        success: true,
                        message: 'Session loaded',
                        sessionId
                    });
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                activeSessions.delete(sessionId);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(`[${sessionId}] ❌ Logged out`);
                    await fs.remove(dirs);
                }
            }
        });

    } catch (err) {
        console.error(`[${sessionId}] Load error:`, err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Load failed' });
        }
    }
});

// ============================================
// GET ACTIVE SESSIONS
// ============================================
router.get('/active', (req, res) => {
    const sessions = Array.from(activeSessions.keys());
    res.json({
        count: sessions.length,
        sessions
    });
});

// ============================================
// SEND MESSAGE (for testing)
// ============================================
router.post('/send', async (req, res) => {
    const { sessionId, phone, message } = req.body;

    if (!sessionId || !phone || !message) {
        return res.status(400).json({
            error: 'Required: sessionId, phone, message'
        });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not active' });
    }

    try {
        // Format phone number properly
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

        await session.sock.sendMessage(jid, { text: message });

        res.json({
            success: true,
            message: 'Message sent'
        });
    } catch (err) {
        res.status(500).json({
            error: 'Send failed',
            details: err.message
        });
    }
});

// Error handling
process.on('uncaughtException', (err) => {
    const ignore = [
        "conflict", "Connection Closed", "Stream Errored",
        "code 1006", "ERR_HTTP_HEADERS_SENT"
    ];

    if (!ignore.some(x => String(err).includes(x))) {
        console.error('Exception:', err.message);
    }
});

export default router;