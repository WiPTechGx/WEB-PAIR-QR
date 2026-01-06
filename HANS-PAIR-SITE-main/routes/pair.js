// routes/pair.js
const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const { File, Storage } = require('megajs');

// HARD-CODED Mega credentials
const MEGA_EMAIL = "tohidkhan9050482152@gmail.com";
const MEGA_PASSWORD = "Rvpy.B.6YeZn7CR";

const sessionDir = path.join(__dirname, "session");

// Fixed upload function with proper promise handling
async function uploadToMega(localPath, remoteName) {
    return new Promise((resolve, reject) => {
        const storage = new Storage({
            email: MEGA_EMAIL,
            password: MEGA_PASSWORD
        }, (error) => {
            if (error) {
                return reject(error);
            }

            fs.readFile(localPath, (err, data) => {
                if (err) {
                    return reject(err);
                }

                const uploadStream = storage.upload({
                    name: remoteName,
                    size: data.length
                });

                uploadStream.on('error', (uploadErr) => {
                    reject(uploadErr);
                });

                uploadStream.on('complete', (file) => {
                    try {
                        // Get the full link
                        const fullLink = file.link();
                        
                        // Extract file ID and hash from URL
                        // Format: https://mega.nz/file/FILEID#HASH or https://mega.nz/#!FILEID!HASH
                        let fileInfo = '';
                        if (fullLink.includes('/file/')) {
                            fileInfo = fullLink.split('/file/')[1]; // Gets "FILEID#HASH"
                        } else if (fullLink.includes('/#!')) {
                            fileInfo = fullLink.split('/#!')[1].replace('!', '#'); // Gets "FILEID!HASH" and converts to "FILEID#HASH"
                        } else {
                            // Fallback to full link if format is unexpected
                            fileInfo = fullLink;
                        }
                        
                        const formattedLink = `HANS-BYTE~${fileInfo}`;
                        
                        resolve({ 
                            link: formattedLink, 
                            fullLink: fullLink,
                            file 
                        });
                    } catch (linkErr) {
                        reject(linkErr);
                    }
                });

                uploadStream.write(data, (writeErr) => {
                    if (writeErr) {
                        return reject(writeErr);
                    }
                    uploadStream.end();
                });
            });
        });
    });
}

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number || '';
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log("Baileys version:", version);

        // Ensure session folder exists
        const userSessionPath = path.join(sessionDir, id);
        if (!fs.existsSync(userSessionPath)) fs.mkdirSync(userSessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);

        try {
            let Gifted = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            if (!Gifted.authState.creds.registered) {
                await delay(1500);
                num = (num || '').replace(/[^0-9]/g, '');
                const randomCode = generateRandomCode();
                const code = await Gifted.requestPairingCode(num, randomCode);

                if (!responseSent && !res.headersSent) {
                    res.json({ code });
                    responseSent = true;
                }
            }

            Gifted.ev.on('creds.update', saveCreds);

            Gifted.ev.on("connection.update", async (s) => {
                try {
                    const { connection, lastDisconnect } = s;

                    if (connection === "open") {
                        await delay(5000);

                        let sessionData = null;
                        let attempts = 0;
                        const maxAttempts = 15;

                        while (attempts < maxAttempts && !sessionData) {
                            try {
                                const credsPath = path.join(userSessionPath, "creds.json");
                                if (fs.existsSync(credsPath)) {
                                    const data = fs.readFileSync(credsPath);
                                    if (data && data.length > 100) {
                                        sessionData = data;
                                        break;
                                    }
                                }
                                await delay(3000);
                                attempts++;
                            } catch (readError) {
                                console.error("Read error:", readError);
                                await delay(2000);
                                attempts++;
                            }
                        }

                        if (!sessionData) {
                            console.error("No session data found, cleaning up.");
                            await cleanUpSession();
                            return;
                        }

                        const tempFilename = `gifted_session_${id}.json`;
                        const tempPath = path.join(__dirname, tempFilename);
                        fs.writeFileSync(tempPath, sessionData);

                        let uploaded = false;
                        let uploadAttempts = 0;
                        const maxUploadAttempts = 4;
                        let megaLink = null;

                        while (uploadAttempts < maxUploadAttempts && !uploaded) {
                            try {
                                uploadAttempts++;
                                const result = await uploadToMega(tempPath, tempFilename);
                                megaLink = result.link;
                                uploaded = true;
                            } catch (uploadErr) {
                                console.error(`Mega upload attempt ${uploadAttempts} failed:`, uploadErr);
                                await delay(3000);
                            }
                        }

                        try { fs.unlinkSync(tempPath); } catch (e) {}

                        if (!uploaded || !megaLink) {
                            console.error("Failed to upload to Mega, cleaning up.");
                            await cleanUpSession();
                            return;
                        }

                        // Replace the sendButtons section with this simple message send:

// Replace the sendButtons section with this simple message send:

// Fixed upload function with proper promise handling
async function uploadToMega(localPath, remoteName) {
    return new Promise((resolve, reject) => {
        try {
            const storage = new Storage({
                email: MEGA_EMAIL,
                password: MEGA_PASSWORD,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
            }, (error) => {
                if (error) {
                    return reject(error);
                }

                try {
                    // Create upload stream
                    const uploadStream = storage.upload({
                        name: remoteName,
                        allowUploadBuffering: true
                    });

                    // Pipe the file to upload stream
                    fs.createReadStream(localPath).pipe(uploadStream);

                    // Listen for 'add' event (when file is added to storage)
                    storage.on('add', (file) => {
                        // Get link with callback
                        file.link((err, link) => {
                            if (err) {
                                return reject(err);
                            }

                            try {
                                // Extract file ID and hash from URL
                                // Format: https://mega.nz/file/FILEID#HASH or https://mega.nz/#!FILEID!HASH
                                let fileInfo = '';
                                if (link.includes('/file/')) {
                                    fileInfo = link.split('/file/')[1]; // Gets "FILEID#HASH"
                                } else if (link.includes('/#!')) {
                                    fileInfo = link.split('/#!')[1].replace('!', '#'); // Gets "FILEID!HASH" and converts to "FILEID#HASH"
                                } else {
                                    // Fallback to full link if format is unexpected
                                    fileInfo = link;
                                }
                                
                                const formattedLink = `HANS-BYTE~${fileInfo}`;
                                
                                // Close storage connection
                                storage.close();
                                
                                resolve({ 
                                    link: formattedLink, 
                                    fullLink: link,
                                    file 
                                });
                            } catch (linkErr) {
                                reject(linkErr);
                            }
                        });
                    });

                    // Listen for errors
                    storage.on('error', (err) => {
                        reject(err);
                    });

                } catch (uploadErr) {
                    reject(uploadErr);
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}

// Replace the sendButtons/sendMessage section with this:
try {
    // First message with formatted info
    const messageText = `
╭━━━━━━━━━━━━━━━━━╮
┃ *HANS BYTE V2 SESSION* ┃
╰━━━━━━━━━━━━━━━━━╯

✅ Session successfully uploaded!

📁 *Session ID:*
\`\`\`${megaLink}\`\`\`

🔗 *Bot Repository:*
https://github.com/haroldmth/HANS_BYTE_V2

📢 *WhatsApp Channel:*
https://whatsapp.com/channel/0029Vb6F9V9FHWpsqWq1CF14

Do not share this with anyone... Keep it only to deploy HANS BYTE V2
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʜᴀɴs ʙʏᴛᴇ ᴠ2*
`.trim();

    await Gifted.sendMessage(Gifted.user.id, { 
        text: messageText 
    });
    
    console.log("✅ First message sent successfully!");
    
    // Wait a bit before sending second message
    await delay(1000);
    
    // Second message - just the session ID alone
    await Gifted.sendMessage(Gifted.user.id, { 
        text: megaLink 
    });
    
    console.log("✅ Session ID resent successfully!");
} catch (sendErr) {
    console.error("Failed to send message:", sendErr);
}
                          

                        await delay(2000);
                        try { await Gifted.ws.close(); } catch(e){}
                        await cleanUpSession();

                    } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode != 401) {
                        console.log("Connection closed unexpectedly, attempting reconnect in 5s...");
                        await delay(5000);
                        GIFTED_PAIR_CODE();
                    }
                } catch (evtErr) {
                    console.error("connection.update handler error:", evtErr);
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await GIFTED_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;