// gift/index.js - CommonJS
const fs = require('fs');

const SESSION_PREFIX = 'pgwiz_PGWIZ-MD_';

function pgwizId(customId = null) {
  if (customId) {
    // Sanitize custom ID - only allow alphanumeric and underscore
    const sanitized = customId.replace(/[^a-zA-Z0-9_]/g, '');
    return SESSION_PREFIX + sanitized;
  }

  // Generate random 16-char ID
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 16; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return SESSION_PREFIX + result;
}

function generateRandomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    await fs.promises.rm(filePath, { recursive: true, force: true });
  }
}

module.exports = {
  pgwizId,
  generateRandomCode,
  removeFile,
  SESSION_PREFIX
};
