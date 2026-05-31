const { EmbedBuilder } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const DICE_EMOJI = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

module.exports = {
  name: 'dice',
  description: 'Roll a dice. Bet on a number (exact) or high/low',
  usage: '.dice <bet> <1-6|high|low>',
  async execute(message, args) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .dice <bet> <1-6|high|low>`')] });

    const target = args[1]?.toLowerCase();
    const validTargets = ['1', '2', '3', '4', '5', '6', 'high', 'low'];
    if (!target || !validTargets.includes(target)) {
      return message.reply({ embeds: [errorEmbed('Invalid Target', 'Pick a number 1-6, `high` (4-6), or `low` (1-3)')] });
    }

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    removeBalance(message.author.id, bet);

    const roll = Math.floor(Math.random() * 6) + 1;
    let won = false;
    let mult = 0;
    let label = '';

    if (target === 'high') { won = roll >= 4; mult = 2; label = 'High (4-6)'; }
    else if (target === 'low') { won = roll <= 3; mult = 2; label = 'Low (1-3)'; }
    else { won = roll === parseInt(target); mult = 5; label = `Exact: ${target}`; }

    const winnings = won ? Math.floor(bet * mult) : 0;
    if (won) addBalance(message.author.id, winnings);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    const newBal = getUser(message.author.id).balance;

    const embed = new EmbedBuilder()
      .setColor(won ? config.colors.success : config.colors.error)
      .setTitle('🎲 Dice Roll')
      .setDescription([
        `You rolled: **${DICE_EMOJI[roll]} ${roll}**`,
        `Your bet: **${label}** (${mult}x payout)`,
        '',
        won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` : `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
      ].join('\n'))
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
