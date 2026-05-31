const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

function generateCrashPoint() {
  const r = Math.random();
  if (r < 0.04) return 1.0;
  return Math.max(1.01, parseFloat((0.96 / (1 - r)).toFixed(2)));
}

function buildBar(current, max) {
  const pct = Math.min(current / Math.max(max, 5), 1);
  const filled = Math.floor(pct * 20);
  return `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${(pct * 100).toFixed(0)}%`;
}

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

    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'Crash', userId: message.author.id, bet });

    const crashPoint = generateCrashPoint();
    let current = 1.00;
    let cashedOut = false;

    const row = new ActionRowBuilder().addComponents(
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
        `Bet: **${bet.toLocaleString()}** ${config.currency}`,
      ].join('\n'))
      .setTimestamp();

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      if (!cashedOut) {
        cashedOut = true;
        collector.stop('cashout');
        await i.deferUpdate();
      }
    });

    const interval = setInterval(async () => {
      if (cashedOut) { clearInterval(interval); return; }
      current = parseFloat((current + (current < 2 ? 0.06 : current < 5 ? 0.12 : 0.25)).toFixed(2));

      if (current >= crashPoint) {
        clearInterval(interval);
        client.activeGames.delete(gameKey);
        collector.stop('crashed');
        recordGame(message.author.id, false, bet);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        const embed = buildEmbed(true);
        embed.setDescription(embed.data.description + `\n😢 Lost **${bet.toLocaleString()}** ${config.currency}.\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`);
        reply.edit({ embeds: [embed], components: [] }).catch(() => {});
        return;
      }
      reply.edit({ embeds: [buildEmbed()], components: [row] }).catch(() => {});
    }, 650);

    collector.on('end', async (_, reason) => {
      clearInterval(interval);
      client.activeGames.delete(gameKey);
      if (reason === 'cashout') {
        // Apply multiplier floor + house edge
        const winnings = calcPayout(bet, current, true);
        addWin(message.author.id, winnings, isDemo);
        recordGame(message.author.id, winnings > bet, winnings > bet ? winnings - bet : bet - winnings);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        const embed = new EmbedBuilder()
          .setColor(winnings >= bet ? config.colors.success : config.colors.warning)
          .setTitle(`💰 Cashed Out!${balLabel(isDemo)}`)
          .setDescription([
            `Cashed out at **${current.toFixed(2)}x**`,
            `Won **${winnings.toLocaleString()}** ${config.currency}!`,
            `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
          ].join('\n'))
          .setTimestamp();
        reply.edit({ embeds: [embed], components: [] }).catch(() => {});
      }
    });
  },
};
