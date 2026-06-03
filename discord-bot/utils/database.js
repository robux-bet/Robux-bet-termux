const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../data/users.json');

function generateStatusCode(userId) {
  return crypto.createHash('sha256').update('statuscode:' + userId).digest('hex').slice(0, 8).toUpperCase();
}

function loadDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getUser(userId) {
  const db = loadDB();
  if (!db[userId]) {
    db[userId] = {
      balance: 0,
      demoBalance: 0,
      hasClaimedDemo: false,
      vault: 0,
      lastDaily: null,
      statusCode: generateStatusCode(userId),
      seed: crypto.createHash('sha256').update(userId + Date.now().toString()).digest('hex').slice(0, 16),
      nonce: 0,
      totalWon: 0,
      totalLost: 0,
      gamesPlayed: 0,
    };
    saveDB(db);
  }
  // Ensure new fields on existing users
  const u = db[userId];
  if (u.demoBalance === undefined) { u.demoBalance = 0; u.hasClaimedDemo = false; saveDB(db); }
  if (!u.statusCode) { u.statusCode = generateStatusCode(userId); saveDB(db); }
  if (u.wagerRequired === undefined) { u.wagerRequired = 0; saveDB(db); }
  if (u.demoGamesPlayed === undefined) { u.demoGamesPlayed = 0; saveDB(db); }
  if (u.realGamesPlayed === undefined) { u.realGamesPlayed = 0; saveDB(db); }
  if (u.hasUsedAllin === undefined) { u.hasUsedAllin = false; saveDB(db); }
  return u;
}

function saveUser(userId, userData) {
  const db = loadDB();
  db[userId] = userData;
  saveDB(db);
}

// Which pool is the user currently betting from?
// Actual (balance > 0) takes priority. Otherwise demo.
function getActivePool(userId) {
  const u = getUser(userId);
  if (u.balance > 0) return { amount: u.balance, isDemo: false };
  return { amount: u.demoBalance || 0, isDemo: true };
}

function isDemo(userId) {
  return getActivePool(userId).isDemo;
}

function claimDemo(userId) {
  const u = getUser(userId);
  if (u.hasClaimedDemo) return false;
  u.demoBalance = 1000;
  u.hasClaimedDemo = true;
  saveUser(userId, u);
  return true;
}

function spendBet(userId, amount, demo) {
  const u = getUser(userId);
  if (demo) u.demoBalance = Math.max(0, (u.demoBalance || 0) - amount);
  else {
    u.balance = Math.max(0, u.balance - amount);
    u.lastWagered = Date.now();
    u.wagerRequired = Math.max(0, (u.wagerRequired || 0) - amount);
  }
  saveUser(userId, u);
}

function addWin(userId, amount, demo) {
  const u = getUser(userId);
  if (demo) u.demoBalance = (u.demoBalance || 0) + amount;
  else u.balance = u.balance + amount;
  saveUser(userId, u);
}

function addBalance(userId, amount) {
  const u = getUser(userId);
  u.balance = Math.max(0, u.balance + amount);
  saveUser(userId, u);
  return u.balance;
}

function removeBalance(userId, amount) {
  const u = getUser(userId);
  u.balance = Math.max(0, u.balance - amount);
  saveUser(userId, u);
  return u.balance;
}

function setBalance(userId, amount) {
  const u = getUser(userId);
  u.balance = Math.max(0, amount);
  saveUser(userId, u);
  return u.balance;
}

function getVault(userId) { return getUser(userId).vault || 0; }

function setVault(userId, amount) {
  const u = getUser(userId);
  u.vault = Math.max(0, amount);
  saveUser(userId, u);
  return u.vault;
}

function getSeed(userId) { return getUser(userId).seed; }

function setSeed(userId, seed) {
  const u = getUser(userId);
  u.seed = seed;
  u.nonce = 0;
  saveUser(userId, u);
}

function incrementNonce(userId) {
  const u = getUser(userId);
  u.nonce = (u.nonce || 0) + 1;
  saveUser(userId, u);
  return u.nonce;
}

function recordGame(userId, won, amount) {
  const u = getUser(userId);
  u.gamesPlayed = (u.gamesPlayed || 0) + 1;
  if (won) u.totalWon = (u.totalWon || 0) + amount;
  else u.totalLost = (u.totalLost || 0) + amount;
  saveUser(userId, u);
}

module.exports = {
  getUser, saveUser, loadDB,
  getActivePool, isDemo, claimDemo,
  spendBet, addWin,
  addBalance, removeBalance, setBalance,
  getVault, setVault,
  getSeed, setSeed, incrementNonce,
  recordGame,
  generateStatusCode,
};
