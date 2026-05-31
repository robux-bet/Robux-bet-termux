const { EmbedBuilder } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
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

    const game = beginGame(message.author.id, 1);
    spendBet(message.author.id, bet, isDemo);

    const SPIN = ['🔴','⚫','🟢','🔴','⚫','🔴','⚫'];
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle(`🎡 Roulette${balLabel(isDemo)}`).setTimestamp();
    const reply = await message.reply({ embeds: [embed.setDescription('🌀 Spinning the wheel...')] });

    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 450));
      embed.setDescription(`${SPIN[i % SPIN.length]} **${Math.floor(Math.random() * 37)}**... spinning`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 600));
    const result = Math.floor(game.floats[0] * 37);
    const mult = calcMult(betType, result);
    const won = mult > 0;
    const winnings = won ? calcPayout(bet, mult) : 0;

    if (won) addWin(message.author.id, winnings, isDemo);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

    saveGameRecord({
      gameId: game.gameId, type: 'roulette', userId: message.author.id,
      serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
      clientSeed: game.clientSeed, nonce: game.nonce,
      inputs: { betTarget },
      outcome: { number: result, result: won ? 'win' : 'lose' },
    });

    embed
      .setColor(won ? config.colors.success : config.colors.error)
      .setDescription([
        `${getColor(result)} **${result}** — ${result === 0 ? 'Green' : RED.includes(result) ? 'Red' : 'Black'}`,
        `Your bet: **${betTarget}** (${mult}x)`,
        '',
        won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` : `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
        '',
        `*Payouts: Color/Even/Odd/High/Low = 2x · Number = 35x · Green = 14x (5% house edge)*`,
      ].join('\n'))
      .setFooter({ text: gameIdFooter(game.gameId) });

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
