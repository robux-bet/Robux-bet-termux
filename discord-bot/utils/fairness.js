const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { generateServerSeed, hashServerSeed, generateFloats, floatToRange } = require('./provableFair');
const { getUser, saveUser } = require('./database');

const GAMES_PATH = path.join(__dirname, '../data/games.json');
const MAX_RECORDS = 50000;

function loadGames() {
  if (!fs.existsSync(GAMES_PATH)) { fs.writeFileSync(GAMES_PATH, JSON.stringify({}, null, 2)); return {}; }
  try { return JSON.parse(fs.readFileSync(GAMES_PATH, 'utf8')); } catch { return {}; }
}

function saveGames(data) {
  fs.writeFileSync(GAMES_PATH, JSON.stringify(data, null, 2));
}

function makeGameId(serverSeed) {
  return crypto.createHash('sha256').update(serverSeed + ':' + Date.now()).digest('hex').slice(0, 8).toUpperCase();
}

function beginGame(userId, floatCount = 52) {
  const serverSeed = generateServerSeed();
  const hashedServerSeed = hashServerSeed(serverSeed);
  const user = getUser(userId);
  const clientSeed = user.seed || 'default';
  const nonce = user.nonce || 0;
  user.nonce = nonce + 1;
  saveUser(userId, user);
  const gameId = makeGameId(serverSeed);
  const floats = generateFloats(serverSeed, clientSeed, nonce, floatCount);
  return { gameId, serverSeed, hashedServerSeed, clientSeed, nonce, floats };
}

function saveGameRecord({ gameId, type, userId, serverSeed, hashedServerSeed, clientSeed, nonce, inputs, outcome }) {
  const games = loadGames();
  games[gameId] = { id: gameId, type, userId, serverSeed, hashedServerSeed, clientSeed, nonce, inputs, outcome, timestamp: Date.now() };
  const keys = Object.keys(games);
  if (keys.length > MAX_RECORDS) {
    const sorted = keys.sort((a, b) => games[a].timestamp - games[b].timestamp);
    for (let i = 0; i < keys.length - MAX_RECORDS; i++) delete games[sorted[i]];
  }
  saveGames(games);
}

function getGameRecord(gameId) {
  return loadGames()[(gameId || '').toUpperCase()] || null;
}

function deriveMineBoardFromFloats(floats, total, mineCount) {
  const positions = Array.from({ length: total }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const fi = floats[positions.length - 1 - i] ?? 0;
    const j = Math.floor(fi * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return new Set(positions.slice(0, mineCount));
}

function shuffleDeckFromFloats(deck, floats) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const fi = floats[d.length - 1 - i] ?? 0;
    const j = Math.floor(fi * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function deriveCrashPoint(float) {
  return Math.max(1.01, parseFloat((1 / (1 - float)).toFixed(2)));
}

function deriveWeightedItem(float, items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = float * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function gameIdFooter(gameId) {
  return `🔑 Game ID: ${gameId}  |  .verify ${gameId}`;
}

module.exports = {
  beginGame,
  saveGameRecord,
  getGameRecord,
  deriveMineBoardFromFloats,
  shuffleDeckFromFloats,
  deriveCrashPoint,
  deriveWeightedItem,
  gameIdFooter,
  floatToRange,
};
