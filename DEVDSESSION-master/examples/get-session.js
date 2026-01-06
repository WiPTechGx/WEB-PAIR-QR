import { generateKeyPairSync, privateDecrypt, createDecipheriv } from "crypto";
// import { writeFileSync } from "fs";

const SESSION_ID = "DEVD-UO8K-T32U"; // use your session id
const API = "http://localhost:8000";
const passphrase = "passphrase"; // change passphrase

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: {
        type: "spki",
        format: "pem",
    },
    privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
        cipher: "aes-256-cbc",
        passphrase: passphrase,
    },
});

function decryptIv(key, iv, data) {
    const decipher = createDecipheriv("aes256", key, iv);
    const decryptedMessage =
        decipher.update(data, "hex", "utf8") + decipher.final("utf8");
    return decryptedMessage;
}

const response = await fetch(`${API}/api/session/${SESSION_ID}`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify({ publicKey }),
});
if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
}

const { session, key, iv } = await response.json();

const decryptedKey = privateDecrypt(
    { key: privateKey, passphrase },
    Buffer.from(key, "base64")
);

const decryptedSession = decryptIv(
    decryptedKey,
    Buffer.from(iv, "base64"),
    session
);

console.log(decryptedSession); // use this for your bot

// writeFileSync("creds.json", decryptedSession); // save session to file
