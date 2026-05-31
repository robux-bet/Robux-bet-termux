const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/users.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getUser(userId) {
  const db = loadDB();
  if (!db[userId]) {
    db[userId] = {
      balance: 100,
      vault: 0,
      lastDaily: null,
      seed: generateDefaultSeed(userId),
      nonce: 0,
      totalWon: 0,
      totalLost: 0,
      gamesPlayed: 0,
    };
    saveDB(db);
  }
  return db[userId];
}

function saveUser(userId, userData) {
  const db = loadDB();
  db[userId] = userData;
  saveDB(db);
}

function addBalance(userId, amount) {
  const user = getUser(userId);
  user.balance = Math.max(0, user.balance + amount);
  saveUser(userId, user);
  return user.balance;
}

function removeBalance(userId, amount) {
  const user = getUser(userId);
  user.balance = Math.max(0, user.balance - amount);
  saveUser(userId, user);
  return user.balance;
}

function setBalance(userId, amount) {
  const user = getUser(userId);
  user.balance = Math.max(0, amount);
  saveUser(userId, user);
  return user.balance;
}

function getVault(userId) {
  return getUser(userId).vault || 0;
}

function setVault(userId, amount) {
  const user = getUser(userId);
  user.vault = Math.max(0, amount);
  saveUser(userId, user);
  return user.vault;
}

function generateDefaultSeed(userId) {
  return require('crypto').createHash('sha256').update(userId + Date.now().toString()).digest('hex').slice(0, 16);
}

function getSeed(userId) {
  return getUser(userId).seed;
}

function setSeed(userId, seed) {
  const user = getUser(userId);
  user.seed = seed;
  user.nonce = 0;
  saveUser(userId, user);
}

function incrementNonce(userId) {
  const user = getUser(userId);
  user.nonce = (user.nonce || 0) + 1;
  saveUser(userId, user);
  return user.nonce;
}

function recordGame(userId, won, amount) {
  const user = getUser(userId);
  user.gamesPlayed = (user.gamesPlayed || 0) + 1;
  if (won) {
    user.totalWon = (user.totalWon || 0) + amount;
  } else {
    user.totalLost = (user.totalLost || 0) + amount;
  }
  saveUser(userId, user);
}

module.exports = {
  getUser,
  saveUser,
  addBalance,
  removeBalance,
  setBalance,
  getVault,
  setVault,
  getSeed,
  setSeed,
  incrementNonce,
  recordGame,
  loadDB,
};
