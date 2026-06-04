const { EmbedBuilder } = require('discord.js');
const { spendBet, addWin, getUser, saveUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function getBetType(bet) {
  const n = parseInt(bet);
  if (!isNaN(n) && n >= 0 && n <= 36) return { type: 'number', value: n };
  const map = { red:'red', black:'black', green:'green', '0':'green', even:'even', odd:'odd', low:'low', high:'high' };
  if (map[bet]) return { type: map[bet] };
  return null;
}

function getColor(num) {
  if (num === 0) return '🟢';
  return RED.includes(num) ? '🔴' : '⚫';
}

function calcMult(betType, result) {
  const isRed = RED.includes(result);
  switch (betType.type) {
    case 'number': return betType.value === result ? 35 : 0;
    case 'red':   return isRed ? 2 : 0;
    case 'black': return !isRed && result !== 0 ? 2 : 0;
    case 'green': return result === 0 ? 14 : 0;
    case 'even':  return result !== 0 && result % 2 === 0 ? 2 : 0;
    case 'odd':   return result % 2 === 1 ? 2 : 0;
    case 'low':   return result >= 1 && result <= 18 ? 2 : 0;
    case 'high':  return result >= 19 && result <= 36 ? 2 : 0;
    default: return 0;
  }
}

module.exports = {
  name: 'roulette',
  aliases: ['rou'],
  description: 'Spin the roulette wheel',
  usage: '.roulette <bet|all|half> <red|black|green|even|odd|low|high|0-36>',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const betTarget = args[1]?.toLowerCase();
    const betType = betTarget ? getBetType(betTarget) : null;
    if (!betType) return message.reply({ embeds: [errorEmbed('Invalid Bet Type', 'Choose: `red` `black` `green` `even` `odd` `low` `high` or a number `0-36`')] });

    let defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);

    // Roulette real-balance rule: bet > 2 = instant lose; bet 1-2 = win up to 3 times then lose
    if (!isDemo && !isForceWin(defaultMode)) {
      if (bet > 2) {
        defaultMode = 'lose';
      } else {
        const u = getUser(message.author.id);
        const smallWins = u.rouletteSmallWins || 0;
        defaultMode = smallWins < 3 ? 'win' : 'lose';
      }
    }

    const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Roulette');

    const game = beginGame(message.author.id, 1);
    spendBet(message.author.id, bet, isDemo);

    let result;
    if (isForceWin(mode)) {
      switch (betType.type) {
        case 'number': result = betType.value; break;
        case 'red':    result = 1; break;
        case 'black':  result = 2; break;
        case 'green':  result = 0; break;
        case 'even':   result = 2; break;
        case 'odd':    result = 1; break;
        case 'low':    result = 1; break;
        case 'high':   result = 19; break;
        default:       result = Math.floor(game.floats[0] * 37);
      }
    } else if (mode === 'lose') {
      switch (betType.type) {
        case 'number': result = betType.value === 0 ? 1 : (betType.value + 1) % 37; break;
        case 'red':    result = 2; break;
        case 'black':  result = 1; break;
        case 'green':  result = 1; break;
        case 'even':   result = 1; break;
        case 'odd':    result = 2; break;
        case 'low':    result = 19; break;
        case 'high':   result = 1; break;
        default:       result = Math.floor(game.floats[0] * 37);
      }
    } else {
      result = Math.floor(game.floats[0] * 37);
    }

    const mult = calcMult(betType, result);
    const won = mult > 0;
    const winnings = won ? calcPayout(bet, mult) : 0;

    if (won) addWin(message.author.id, winnings, isDemo);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    recordRiggedGame(message.author.id, isDemo, mode);

    if (won && !isDemo && bet <= 2) {
      const u = getUser(message.author.id);
      u.rouletteSmallWins = (u.rouletteSmallWins || 0) + 1;
      saveUser(message.author.id, u);
    }
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
        `*Payouts: Color/Even/Odd/High/Low = 2x · Number = 35x · Green = 14x*`,
      ].join('\n'))
      .setFooter({ text: gameIdFooter(game.gameId) })
      .setTimestamp();

    loadMsg.edit({ embeds: [embed] }).catch(() => {});
  },
};
