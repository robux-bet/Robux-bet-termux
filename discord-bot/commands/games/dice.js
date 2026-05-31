const { EmbedBuilder } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const DICE_EMOJI = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

module.exports = {
  name: 'dice',
  description: 'Roll a dice — pick a number (5x) or high/low (2x)',
  usage: '.dice <bet|all|half> <1-6|high|low>',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const target = args[1]?.toLowerCase();
    if (!target || !['1','2','3','4','5','6','high','low'].includes(target)) {
      return message.reply({ embeds: [errorEmbed('Invalid Target', 'Pick a number 1–6, `high` (4-6), or `low` (1-3).\n`Usage: .dice <bet> <1-6|high|low>`')] });
    }

    spendBet(message.author.id, bet, isDemo);

    const roll = Math.floor(Math.random() * 6) + 1;
    let won = false, mult = 0, label = '';
    if (target === 'high') { won = roll >= 4; mult = 2; label = 'High (4-6)'; }
    else if (target === 'low') { won = roll <= 3; mult = 2; label = 'Low (1-3)'; }
    else { won = roll === parseInt(target); mult = 5; label = `Exact: ${target}`; }

    const winnings = won ? calcPayout(bet, mult) : 0;
    if (won) addWin(message.author.id, winnings, isDemo);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

    const embed = new EmbedBuilder()
      .setColor(won ? config.colors.success : config.colors.error)
      .setTitle(`🎲 Dice Roll${balLabel(isDemo)}`)
      .setDescription([
        `You rolled: **${DICE_EMOJI[roll]} ${roll}**`,
        `Your bet: **${label}** (${mult}x)`,
        '',
        won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` : `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
      ].join('\n'))
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
