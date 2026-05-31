const { EmbedBuilder } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

function generateResult() {
  // House edge ~3%, generates numbers from 1.01 to very high
  const r = Math.random();
  if (r < 0.03) return 1.0;
  return parseFloat(Math.max(1.01, 0.97 / (1 - Math.random())).toFixed(2));
}

module.exports = {
  name: 'limbo',
  description: 'Set a target multiplier — win if the result is over it',
  usage: '.limbo <bet> <target_multiplier>',
  async execute(message, args) {
    const bet = parseInt(args[0]);
    const target = parseFloat(args[1]);

    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .limbo <bet> <multiplier>`')] });
    if (isNaN(target) || target < 1.01 || target > 1000000) return message.reply({ embeds: [errorEmbed('Invalid Target', 'Target multiplier must be between **1.01x** and **1000000x**')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    removeBalance(message.author.id, bet);

    const result = generateResult();
    const won = result >= target;
    const winnings = won ? Math.floor(bet * target) : 0;

    if (won) addBalance(message.author.id, winnings);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    const newBal = getUser(message.author.id).balance;

    // Animate
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📊 Limbo')
      .setDescription('🌀 Generating result...')
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 400));
      embed.setDescription(`📊 **${(Math.random() * 10 + 1).toFixed(2)}x** ← rolling...`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 500));

    embed
      .setColor(won ? config.colors.success : config.colors.error)
      .setDescription([
        `Result: **${result.toFixed(2)}x**`,
        `Your target: **${target.toFixed(2)}x**`,
        '',
        won
          ? `🎉 **Over!** Won **${winnings.toLocaleString()}** ${config.currency}!`
          : `😢 **Under!** Lost **${bet.toLocaleString()}** ${config.currency}.`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
        '',
        `*Win chance: ${(97 / target).toFixed(2)}% | Payout: ${target}x*`,
      ].join('\n'));

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
