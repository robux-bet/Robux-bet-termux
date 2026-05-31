const { EmbedBuilder } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const PAYOUT_TABLES = {
  8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  12: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
  16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
};

function simulatePlinko(rows) {
  let pos = 0;
  for (let i = 0; i < rows; i++) {
    pos += Math.random() < 0.5 ? 0 : 1;
  }
  return pos;
}

function buildPlinkoBoard(rows, finalPos) {
  const lines = [];
  for (let r = 0; r <= rows; r++) {
    const pegs = r + 1;
    const line = Array(pegs).fill('🔘');
    lines.push(' '.repeat(rows - r) + line.join(' '));
  }
  const payouts = PAYOUT_TABLES[rows] || PAYOUT_TABLES[8];
  const payoutLine = payouts.map((p, i) => i === finalPos ? `[**${p}x**]` : `${p}x`).join(' ');
  lines.push('\n' + payoutLine);
  return lines.join('\n');
}

module.exports = {
  name: 'plinko',
  description: 'Drop the ball through the Plinko board',
  usage: '.plinko <bet> [8|12|16]',
  async execute(message, args) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .plinko <bet> [8|12|16]`')] });

    const rows = [8, 12, 16].includes(parseInt(args[1])) ? parseInt(args[1]) : 8;

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    removeBalance(message.author.id, bet);

    const finalPos = simulatePlinko(rows);
    const payouts = PAYOUT_TABLES[rows] || PAYOUT_TABLES[8];
    const mult = payouts[finalPos] || 0.5;
    const winnings = Math.floor(bet * mult);
    const won = winnings >= bet;

    addBalance(message.author.id, winnings);
    recordGame(message.author.id, won, won ? winnings - bet : bet - winnings);
    const newBal = getUser(message.author.id).balance;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🎯 Plinko')
      .setDescription(`🟡 Dropping ball...\nRows: **${rows}**`)
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });

    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 700));
      embed.setDescription(`🟡 Falling... Row ${i * Math.floor(rows / 3) + 1}/${rows}`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 600));

    embed
      .setColor(won ? config.colors.success : config.colors.error)
      .setDescription([
        `\`\`\``,
        buildPlinkoBoard(Math.min(rows, 8), Math.floor(finalPos * (Math.min(rows, 8) / rows))),
        `\`\`\``,
        `Ball landed in slot **${finalPos + 1}** → **${mult}x**`,
        won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` : `😢 Got back **${winnings.toLocaleString()}** ${config.currency}.`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
      ].join('\n'));

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
