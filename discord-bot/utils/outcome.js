const { getUser, saveUser } = require('./database');
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');

function isAdminMember(member) {
  if (!member) return false;
  try {
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

  // Admin-forced single-game override (.ayowtf panel)
  if (u.forceNextOutcome) return u.forceNextOutcome;

  if (isDemo) {
    const played = u.demoGamesPlayed || 0;
    return played < 5 ? 'win' : 'fair';
  }

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
  }
  saveUser(userId, u);
}

module.exports = { getRiggedMode, isForceWin, recordRiggedGame };
