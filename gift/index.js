// gift/index.js - CommonJS
const fs = require('fs');

function pgwizId(num = 16) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < num; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
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
  removeFile
};
