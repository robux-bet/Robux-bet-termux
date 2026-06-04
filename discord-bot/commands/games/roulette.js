const { EmbedBuilder } = require('discord.js');
const { spendBet, addWin, getUser, saveUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
const EVENS = [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36];
const ODDS = [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function getColor(num) {
  if (num === 0) return '🟢';
  return RED.includes(num) ? '🔴' : '⚫';
}

function getBetType(bet) {
  const n = parseInt(bet);
  if (!isNaN(n) && n >= 0 && n <= 36) return { type: 'number', value: n };
  const map = { red:'red', black:'black', green:'green', '0':'green', even:'even', odd:'odd', low:'low', high:'high' };
  if (map[bet]) return { type: map[bet] };
  return null;
}

// Multipliers — balanced, no insane payouts
function getMult(betType) {
  switch (betType.type) {
    case 'number': return 10; // 10x (was 35x)
    case 'green': return 5;  // 5x  (was 14x)
    default: return 2;        // red/black/even/odd/low/high = 2x
  }
}

// Pick a WINNING result for the bet type (varies randomly)
function winResult(betType) {
  switch (betType.type) {
    case 'red':   return pick(RED);
    case 'black': return pick(BLACK);
    case 'green': return 0;
    case 'even':  return pick(EVENS);
    case 'odd':   return pick(ODDS);
    case 'low':   return randInt(1, 18);
    case 'high':  return randInt(19, 36);
    case 'number': return betType.value; // must match for number bets (admin WIN only)
    default: return randInt(1, 36);
  }
}

// Pick a LOSING result for the bet type (varies randomly)
function loseResult(betType) {
  switch (betType.type) {
    case 'red':    return pick([...BLACK, 0]);
    case 'black':  return pick([...RED, 0]);
    case 'green':  return pick(RED); // not green
    case 'even': { let r; do { r = randInt(1, 36); } while (r % 2 === 0); return r; }
    case 'odd':  { let r; do { r = randInt(1, 36); } while (r % 2 !== 0); return r; }
    case 'low':    return randInt(19, 36);
    case 'high':   return randInt(1, 18);
    case 'number': { let r; do { r = randInt(0, 36); } while (r === betType.value); return r; }
    default: return randInt(0, 36);
  }
}

module.exports = {
  name: 'roulette',
  aliases: ['rou'],
  description: 'Spin the roulette wheel',
  usage: '.roulette <bet|all|half> <red|black|green|even|odd|low|high>',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const betTarget = args[1]?.toLowerCase();
    const betType = betTarget ? getBetType(betTarget) : null;
    if (!betType) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Choose: `red` `black` `green` `even` `odd` `low` `high`\n*(Exact numbers are disabled.)*')] });

    // Number bets are disabled in natural play — only admin WIN can force it
    if (betType.type === 'number' && !isDemo) {
      return message.reply({ embeds: [errorEmbed('Disabled', 'Exact number bets are disabled. Choose: `red` `black` `green` `even` `odd` `low` `high`')] });
    }

    let defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);

    const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Roulette');

    const game = beginGame(message.author.id, 1);
    spendBet(message.author.id, bet, isDemo);

    let result;
    if (isForceWin(mode)) {
      result = winResult(betType);
    } else {
      // lose by default for non-demo non-admin
      result = loseResult(betType);
    }

    const mult = getMult(betType);
    // Determine actual win: check if result matches betType
    let won = false;
    switch (betType.type) {
      case 'red':    won = RED.includes(result); break;
      case 'black':  won = BLACK.includes(result); break;
      case 'green':  won = result === 0; break;
      case 'even':   won = result !== 0 && result % 2 === 0; break;
      case 'odd':    won = result % 2 === 1; break;
      case 'low':    won = result >= 1 && result <= 18; break;
      case 'high':   won = result >= 19 && result <= 36; break;
      case 'number': won = result === betType.value; break;
    }

    const winnings = won ? calcPayout(bet, mult) : 0;
    if (won) addWin(message.author.id, winnings, isDemo);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    recordRiggedGame(message.author.id, isDemo, mode);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

    saveGameRecord({
      gameId: game.gameId, type: 'roulette', userId: message.author.id,
      serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
      clientSeed: game.clientSeed, nonce: game.nonce,
      inputs: { betTarget },
      outcome: { number: result, result: won ? 'win' : 'lose' },
    });

    const embed = new EmbedBuilder()
      .setColor(won ? config.colors.success : config.colors.error)
      .setTitle(`🎡 Roulette${balLabel(isDemo)}`)
      .setDescription([
        `${getColor(result)} **${result}** — ${result === 0 ? 'Green' : RED.includes(result) ? 'Red' : 'Black'}`,
        `Your bet: **${betTarget}** (${mult}x)`,
        '',
        won ? `🎉 Won **${fmtR(winnings)}** ${config.currency}!` : `😢 Lost **${fmtR(bet)}** ${config.currency}.`,
        `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
        '',
        `*Payouts: Color/Even/Odd/High/Low = 2x · Green = 5x*`,
      ].join('\n'))
      .setFooter({ text: gameIdFooter(game.gameId) })
      .setTimestamp();

    loadMsg.edit({ embeds: [embed] }).catch(() => {});
  },
};
