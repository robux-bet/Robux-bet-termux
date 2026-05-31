const { EmbedBuilder } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const config = require('../../config');

const PAYOUT_TABLES = {
  8:  [5, 2, 1, 1, 0, 1, 1, 2, 5],
  12: [8, 3, 1, 1, 1, 0, 1, 1, 1, 3, 8],
  16: [15, 9, 2, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 2, 9, 15],
};

module.exports = {
  name: 'plinko',
  description: 'Drop the ball through the Plinko board',
  usage: '.plinko <bet|all|half> [8|12|16]',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const rows = [8, 12, 16].includes(parseInt(args[1])) ? parseInt(args[1]) : 8;
    const game = beginGame(message.author.id, rows);
    spendBet(message.author.id, bet, isDemo);

    let finalPos = 0;
    const path = [];
    for (let i = 0; i < rows; i++) {
      const step = game.floats[i] < 0.5 ? 0 : 1;
      path.push(step);
      finalPos += step;
    }

    const payouts = PAYOUT_TABLES[rows];
    const mult = payouts[finalPos] ?? 0;

    let winnings;
    if (mult === 0) winnings = 0;
    else if (mult === 1) winnings = bet;
    else winnings = calcPayout(bet, mult);

    if (winnings > 0) addWin(message.author.id, winnings, isDemo);
    recordGame(message.author.id, winnings > bet, winnings > bet ? winnings - bet : bet - winnings);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

    saveGameRecord({
      gameId: game.gameId, type: 'plinko', userId: message.author.id,
      serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
      clientSeed: game.clientSeed, nonce: game.nonce,
      inputs: { rows },
      outcome: { path, finalPos, mult, result: winnings > bet ? 'win' : winnings === bet ? 'push' : 'lose' },
    });

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
      ].join('\n'))
      .setFooter({ text: gameIdFooter(game.gameId) });

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
