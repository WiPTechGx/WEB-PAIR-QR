// routes/qr.js
const { 
    giftedId,
    removeFile
} = require('../gift');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: giftedConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Storage } = require('megajs');

// HARD-CODED Mega credentials
const MEGA_EMAIL = "tohidkhan9050482152@gmail.com";
const MEGA_PASSWORD = "Rvpy.B.6YeZn7CR";

const sessionDir = path.join(__dirname, "session");

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
                                let fileInfo = '';
                                if (link.includes('/file/')) {
                                    fileInfo = link.split('/file/')[1];
                                } else if (link.includes('/#!')) {
                                    fileInfo = link.split('/#!')[1].replace('!', '#');
                                } else {
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

router.get('/', async (req, res) => {
    const id = giftedId();
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

    async function HANS_BYTE_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log("Baileys version:", version);
        
        const userSessionPath = path.join(sessionDir, id);
        if (!fs.existsSync(userSessionPath)) fs.mkdirSync(userSessionPath, { recursive: true });
        
        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);
        
        try {
            let HansByte = giftedConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true
            });

            HansByte.ev.on('creds.update', saveCreds);
            
            HansByte.ev.on("connection.update", async (s) => {
                try {
                    const { connection, lastDisconnect, qr } = s;
                    
                    if (qr && !responseSent && !res.headersSent) {
                        const qrImage = await QRCode.toDataURL(qr);
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>HANS BYTE V2 | QR CODE</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                <style>
                                    body {
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        min-height: 100vh;
                                        margin: 0;
                                        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
                                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                        color: #fff;
                                        text-align: center;
                                        padding: 20px;
                                        box-sizing: border-box;
                                    }
                                    .container {
                                        width: 100%;
                                        max-width: 600px;
                                    }
                                    .qr-container {
                                        position: relative;
                                        margin: 20px auto;
                                        width: 300px;
                                        height: 300px;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                    }
                                    .qr-code {
                                        width: 300px;
                                        height: 300px;
                                        padding: 15px;
                                        background: white;
                                        border-radius: 25px;
                                        box-shadow: 0 0 0 10px rgba(138, 43, 226, 0.2),
                                                    0 0 0 20px rgba(138, 43, 226, 0.1),
                                                    0 0 40px rgba(138, 43, 226, 0.4);
                                    }
                                    .qr-code img {
                                        width: 100%;
                                        height: 100%;
                                        border-radius: 10px;
                                    }
                                    h1 {
                                        color: #fff;
                                        margin: 0 0 15px 0;
                                        font-size: 32px;
                                        font-weight: 900;
                                        text-shadow: 0 0 20px rgba(138, 43, 226, 0.6);
                                        letter-spacing: 2px;
                                    }
                                    p {
                                        color: #bbb;
                                        margin: 20px 0;
                                        font-size: 16px;
                                    }
                                    .back-btn {
                                        display: inline-block;
                                        padding: 14px 32px;
                                        margin-top: 15px;
                                        background: linear-gradient(135deg, #8a2be2 0%, #9d50bb 100%);
                                        color: white;
                                        text-decoration: none;
                                        border-radius: 30px;
                                        font-weight: bold;
                                        border: none;
                                        cursor: pointer;
                                        transition: all 0.3s ease;
                                        box-shadow: 0 4px 20px rgba(138, 43, 226, 0.4);
                                        text-transform: uppercase;
                                        letter-spacing: 1px;
                                    }
                                    .back-btn:hover {
                                        transform: translateY(-3px);
                                        box-shadow: 0 6px 30px rgba(138, 43, 226, 0.6);
                                    }
                                    .pulse {
                                        animation: pulse 2s infinite;
                                    }
                                    @keyframes pulse {
                                        0% {
                                            box-shadow: 0 0 0 0 rgba(138, 43, 226, 0.6);
                                        }
                                        70% {
                                            box-shadow: 0 0 0 20px rgba(138, 43, 226, 0);
                                        }
                                        100% {
                                            box-shadow: 0 0 0 0 rgba(138, 43, 226, 0);
                                        }
                                    }
                                    @media (max-width: 480px) {
                                        .qr-container {
                                            width: 260px;
                                            height: 260px;
                                        }
                                        .qr-code {
                                            width: 240px;
                                            height: 240px;
                                        }
                                        h1 {
                                            font-size: 26px;
                                        }
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>HANS BYTE V2</h1>
                                    <div class="qr-container">
                                        <div class="qr-code pulse">
                                            <img src="${qrImage}" alt="QR Code"/>
                                        </div>
                                    </div>
                                    <p>Scan this QR code with WhatsApp to connect</p>
                                    <a href="./" class="back-btn">Back</a>
                                </div>
                                <script>
                                    document.querySelector('.back-btn').addEventListener('mousedown', function(e) {
                                        this.style.transform = 'translateY(1px)';
                                        this.style.boxShadow = '0 2px 10px rgba(138, 43, 226, 0.4)';
                                    });
                                    document.querySelector('.back-btn').addEventListener('mouseup', function(e) {
                                        this.style.transform = 'translateY(-3px)';
                                        this.style.boxShadow = '0 6px 30px rgba(138, 43, 226, 0.6)';
                                    });
                                </script>
                            </body>
                            </html>
                        `);
                        responseSent = true;
                    }

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

                        const tempFilename = `hans_byte_session_${id}.json`;
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

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʜᴀɴs ʙʏᴛᴇ ᴠ2*
`.trim();

                            await HansByte.sendMessage(HansByte.user.id, { 
                                text: messageText 
                            });
                            
                            console.log("✅ First message sent successfully!");
                            
                            // Wait a bit before sending second message
                            await delay(1000);
                            
                            // Second message - just the session ID alone
                            await HansByte.sendMessage(HansByte.user.id, { 
                                text: megaLink 
                            });
                            
                            console.log("✅ Session ID resent successfully!");
                        } catch (sendErr) {
                            console.error("Failed to send message:", sendErr);
                        }

                        await delay(2000);
                        try { await HansByte.ws.close(); } catch(e) {}
                        await cleanUpSession();
                        
                    } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode != 401) {
                        console.log("Connection closed unexpectedly, attempting reconnect in 5s...");
                        await delay(5000);
                        HANS_BYTE_QR_CODE();
                    }
                } catch (evtErr) {
                    console.error("connection.update handler error:", evtErr);
                }
            });
        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Hans Byte QR Service Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await HANS_BYTE_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;