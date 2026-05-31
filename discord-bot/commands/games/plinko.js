const { EmbedBuilder } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

// Multipliers are floored — so 1.x becomes 1x (break even), 2.x becomes 2x, etc.
const PAYOUT_TABLES = {
  8:  [5, 2, 1, 1, 0, 1, 1, 2, 5],
  12: [8, 3, 1, 1, 1, 0, 1, 1, 1, 3, 8],
  16: [15, 9, 2, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 2, 9, 15],
};

function simulatePlinko(rows) {
  let pos = 0;
  for (let i = 0; i < rows; i++) pos += Math.random() < 0.5 ? 0 : 1;
  return pos;
}

module.exports = {
  name: 'plinko',
  description: 'Drop the ball through the Plinko board',
  usage: '.plinko <bet|all|half> [8|12|16]',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const rows = [8, 12, 16].includes(parseInt(args[1])) ? parseInt(args[1]) : 8;

    spendBet(message.author.id, bet, isDemo);

    const finalPos = simulatePlinko(rows);
    const payouts = PAYOUT_TABLES[rows];
    const mult = payouts[finalPos] ?? 0;

    // calcPayout with floor already applied (mults are integers here)
    // 0 = lose everything, 1+ = apply house edge
    let winnings;
    if (mult === 0) {
      winnings = 0;
    } else if (mult === 1) {
      // Break-even slot: return bet (no house edge on pure break-even)
      winnings = bet;
    } else {
      winnings = calcPayout(bet, mult);
    }

    if (winnings > 0) addWin(message.author.id, winnings, isDemo);
    recordGame(message.author.id, winnings > bet, winnings > bet ? winnings - bet : bet - winnings);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🎯 Plinko${balLabel(isDemo)}`)
      .setDescription(`🟡 Dropping ball... (${rows} rows)`)
      .setTimestamp();
    const reply = await message.reply({ embeds: [embed] });

    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 550));
      embed.setDescription(`🟡 Falling... Row ${(i + 1) * Math.floor(rows / 4)}/${rows}`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 600));

    const payoutLine = payouts.map((p, i) => i === finalPos ? `**[${p}x]**` : `${p}x`).join(' · ');

    embed
      .setColor(winnings > bet ? config.colors.success : winnings === bet ? config.colors.warning : config.colors.error)
      .setDescription([
        payoutLine,
        '',
        `Ball landed: slot **${finalPos + 1}** → **${mult}x**`,
        winnings > bet ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` :
          winnings === bet ? `🤝 Break even — got **${winnings.toLocaleString()}** ${config.currency} back.` :
          `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
      ].join('\n'));

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
