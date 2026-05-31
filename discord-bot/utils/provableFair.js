const crypto = require('crypto');

function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

function hashServerSeed(serverSeed) {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

function generateFloat(serverSeed, clientSeed, nonce, cursor = 0) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}:${nonce}:${cursor}`);
  const hex = hmac.digest('hex');
  const val = parseInt(hex.slice(0, 8), 16);
  return val / 0x100000000;
}

function generateFloats(serverSeed, clientSeed, nonce, count) {
  const floats = [];
  for (let i = 0; i < count; i++) {
    floats.push(generateFloat(serverSeed, clientSeed, nonce, i));
  }
  return floats;
}

function floatToRange(float, min, max) {
  return Math.floor(float * (max - min + 1)) + min;
}

function generateServerSeedForUser() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  generateServerSeed,
  hashServerSeed,
  generateFloat,
  generateFloats,
  floatToRange,
  generateServerSeedForUser,
};
