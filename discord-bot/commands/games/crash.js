const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, deriveCrashPoint, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

function buildBar(current, max) {
  const pct = Math.min(current / Math.max(max, 5), 1);
  const filled = Math.floor(pct * 20);
  return `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${(pct * 100).toFixed(0)}%`;
}

const CRASH_EXTRAS = {
  label: '💥 Set Crash Point',
  buttons: [
    { label: '💥 Crash 1.2x', value: '1.2' },
    { label: '💥 Crash 1.5x', value: '1.5' },
    { label: '💥 Crash 2x',   value: '2'   },
    { label: '💥 Crash 3x',   value: '3'   },
    { label: '💥 Crash 5x',   value: '5'   },
  ],
};

module.exports = {
  name: 'crash',
  description: 'Watch the multiplier rise — cash out before it crashes!',
  usage: '.crash <bet|all|half>',
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const gameKey = `crash_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current crash game!')] });

    const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    const { mode, loadMsg, extra } = await awaitAdminControl(message, defaultMode, 'Crash', null, CRASH_EXTRAS);

    const game = beginGame(message.author.id, 1);
    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'Crash', userId: message.author.id, bet });

    let crashPoint;
    if (extra) {
      // Admin set a specific crash point
      crashPoint = parseFloat(extra);
    } else if (isForceWin(mode)) {
      crashPoint = 999.99;
    } else {
      // Always crash early — between 1.01 and 1.8
      crashPoint = parseFloat((1.01 + Math.random() * 0.79).toFixed(2));
    }

    let current = 1.00;
    let cashedOut = false;
    let cashedOutAt = null;

    const cashoutRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crash_cashout').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success)
    );

    const buildEmbed = (crashed = false) => new EmbedBuilder()
      .setColor(crashed ? config.colors.error : current >= 3 ? config.colors.gold : config.colors.primary)
      .setTitle(`📈 Crash${balLabel(isDemo)}`)
      .setDescription([
        buildBar(current, crashPoint),
        `**${current.toFixed(2)}x**`,
        '',
        crashed ? `💥 Crashed at **${crashPoint.toFixed(2)}x**` : '⏳ Click Cash Out before it crashes!',
        `Bet: **${fmtR(bet)}** ${config.currency}`,
      ].join('\n'))
      .setTimestamp();

    await loadMsg.edit({ embeds: [buildEmbed()], components: [cashoutRow] });

    const collector = loadMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      if (!cashedOut) { cashedOut = true; cashedOutAt = current; collector.stop('cashout'); await i.deferUpdate(); }
    });

    const interval = setInterval(async () => {
      if (cashedOut) { clearInterval(interval); return; }
      current = parseFloat((current + (current < 2 ? 0.06 : current < 5 ? 0.12 : 0.25)).toFixed(2));

      if (current >= crashPoint) {
        clearInterval(interval);
        client.activeGames.delete(gameKey);
        collector.stop('crashed');
        recordGame(message.author.id, false, bet);
        recordRiggedGame(message.author.id, isDemo, mode);

        saveGameRecord({
          gameId: game.gameId, type: 'crash', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { cashedOutAt: null },
          outcome: { crashPoint, result: 'lose' },
        });

        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        const embed = buildEmbed(true);
        embed.setDescription(embed.data.description + `\n😢 Lost **${fmtR(bet)}** ${config.currency}.\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`)
          .setFooter({ text: gameIdFooter(game.gameId) });
        loadMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
        return;
      }
      loadMsg.edit({ embeds: [buildEmbed()], components: [cashoutRow] }).catch(() => {});
    }, 650);

    collector.on('end', async (_, reason) => {
      clearInterval(interval);
      client.activeGames.delete(gameKey);
      if (reason === 'cashout') {
        const winnings = calcPayout(bet, cashedOutAt, true);
        addWin(message.author.id, winnings, isDemo);
        recordGame(message.author.id, winnings > bet, winnings > bet ? winnings - bet : bet - winnings);
        recordRiggedGame(message.author.id, isDemo, mode);

        saveGameRecord({
          gameId: game.gameId, type: 'crash', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { cashedOutAt },
          outcome: { crashPoint, result: winnings >= bet ? 'win' : 'lose' },
        });

        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        const embed = new EmbedBuilder()
          .setColor(winnings >= bet ? config.colors.success : config.colors.warning)
          .setTitle(`💰 Cashed Out!${balLabel(isDemo)}`)
          .setDescription([
            `Cashed out at **${cashedOutAt.toFixed(2)}x**`,
            `Won **${fmtR(winnings)}** ${config.currency}!`,
            `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
          ].join('\n'))
          .setFooter({ text: gameIdFooter(game.gameId) })
          .setTimestamp();
        loadMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
      }
    });
  },
};
