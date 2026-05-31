const { EmbedBuilder } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

function getBetType(bet) {
  const n = parseInt(bet);
  if (!isNaN(n) && n >= 0 && n <= 36) return { type: 'number', value: n };
  if (bet === 'red') return { type: 'red' };
  if (bet === 'black') return { type: 'black' };
  if (bet === 'green' || bet === '0') return { type: 'green' };
  if (bet === 'even') return { type: 'even' };
  if (bet === 'odd') return { type: 'odd' };
  if (bet === 'low') return { type: 'low' };
  if (bet === 'high') return { type: 'high' };
  return null;
}

function getColor(num) {
  if (num === 0) return '🟢';
  if (RED.includes(num)) return '🔴';
  return '⚫';
}

function calcMultiplier(betType, result) {
  const isRed = RED.includes(result);
  const isBlack = BLACK.includes(result);
  switch (betType.type) {
    case 'number': return betType.value === result ? 36 : 0;
    case 'red': return isRed ? 2 : 0;
    case 'black': return isBlack ? 2 : 0;
    case 'green': return result === 0 ? 14 : 0;
    case 'even': return result !== 0 && result % 2 === 0 ? 2 : 0;
    case 'odd': return result % 2 === 1 ? 2 : 0;
    case 'low': return result >= 1 && result <= 18 ? 2 : 0;
    case 'high': return result >= 19 && result <= 36 ? 2 : 0;
    default: return 0;
  }
}

module.exports = {
  name: 'roulette',
  aliases: ['rou'],
  description: 'Spin the roulette wheel',
  usage: '.roulette <bet> <red|black|green|even|odd|low|high|0-36>',
  async execute(message, args) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .roulette <bet> <red|black|green|even|odd|low|high|0-36>`')] });

    const betTarget = args[1]?.toLowerCase();
    const betType = betTarget ? getBetType(betTarget) : null;
    if (!betType) return message.reply({ embeds: [errorEmbed('Invalid Bet Type', 'Choose: `red` `black` `green` `even` `odd` `low` `high` or a number 0-36')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    removeBalance(message.author.id, bet);

    // Animate wheel
    const SPIN = ['🔴', '⚫', '🟢', '🔴', '⚫', '🔴', '⚫', '🟢'];
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('🎡 Roulette').setTimestamp();
    const reply = await message.reply({ embeds: [embed.setDescription('🌀 Spinning the wheel...')] });

    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 500));
      embed.setDescription(`${SPIN[i % SPIN.length]} Spinning... **${Math.floor(Math.random() * 37)}**`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 700));
    const result = Math.floor(Math.random() * 37);
    const mult = calcMultiplier(betType, result);
    const won = mult > 0;
    const winnings = won ? Math.floor(bet * mult) : 0;

    if (won) addBalance(message.author.id, winnings);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    const newBal = getUser(message.author.id).balance;

    embed
      .setColor(won ? config.colors.success : config.colors.error)
      .setDescription([
        `${getColor(result)} **${result}** — ${result === 0 ? 'Green' : RED.includes(result) ? 'Red' : 'Black'}`,
        `Your bet: **${betTarget}** (${mult}x)`,
        '',
        won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` : `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
        '',
        '*Payouts: Red/Black/Even/Odd/Low/High = 2x · Number = 36x · Green = 14x*',
      ].join('\n'));

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
