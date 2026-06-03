const { getUser, getActivePool } = require('./database');
const config = require('../config');

/**
 * Parse a bet argument ("all", "half", or a number).
 * Returns { bet, isDemo } or { error } string.
 */
function parseBet(userId, arg) {
  const u = getUser(userId);
  if (u.locked) {
    return { error: '🔒 Your account has been locked from gambling. Contact an admin.' };
  }

  const pool = getActivePool(userId);
  if (pool.amount <= 0) {
    return { error: `You have no balance!\n\n💡 Claim **1,000 demo Robux** with \`.demo\`, or ask an admin to add actual balance.` };
  }

  let bet;
  const lower = String(arg).toLowerCase();
  if (lower === 'all') bet = pool.amount;
  else if (lower === 'half') bet = Math.floor(pool.amount / 2);
  else {
    bet = parseInt(arg);
    if (isNaN(bet) || bet <= 0) return { error: `Invalid bet. Use a number, \`all\`, or \`half\`.` };
  }

  if (bet <= 0) return { error: `Bet must be at least 1 ${config.currency}.` };
  if (bet > pool.amount) {
    return { error: `You only have **${pool.amount.toLocaleString()}** ${pool.isDemo ? '(Demo) ' : ''}${config.currency}.` };
  }
  if (pool.isDemo && bet > 100) {
    return { error: `Demo balance bets are capped at **100 ${config.currency}** per game.\n\nDeposit to get actual balance with no limits!` };
  }

  return { bet, isDemo: pool.isDemo };
}

/**
 * Calculate final payout.
 * For variable-mult games (applyFloor=true): floor the multiplier first.
 * Sub-2x floored = return bet (break even).
 */
function calcPayout(bet, mult, applyFloor = false) {
  let m = applyFloor ? Math.floor(mult) : mult;
  if (applyFloor && m <= 1) return bet;
  return Math.floor(bet * m);
}

/**
 * Tie payout — full return.
 */
function tiePayout(bet) {
  return bet;
}

/**
 * 50/50-style win determination.
 */
function rigged50Win(isDemo) {
  return Math.random() < 0.50;
}

/**
 * Format the demo/actual label for embeds.
 */
function balLabel(isDemo) {
  return isDemo ? ' *(Demo)*' : '';
}

module.exports = { parseBet, calcPayout, tiePayout, rigged50Win, balLabel };
