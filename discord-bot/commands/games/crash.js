const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

function generateCrashPoint() {
  // House edge ~3%
  const r = Math.random();
  if (r < 0.03) return 1.0;
  return Math.max(1.01, parseFloat((0.97 / (1 - r)).toFixed(2)));
}

module.exports = {
  name: 'crash',
  description: 'Watch the multiplier grow — cash out before it crashes!',
  usage: '.crash <bet>',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .crash <bet>`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `crash_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'You already have a crash game running!')] });

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'Crash', userId: message.author.id, bet });

    const crashPoint = generateCrashPoint();
    let current = 1.00;
    let cashedOut = false;
    let cashOutMult = 0;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crash_cashout').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success)
    );

    const buildEmbed = (crashed = false) => {
      const bar = buildBar(current, crashPoint);
      return new EmbedBuilder()
        .setColor(crashed ? config.colors.error : current >= 3 ? config.colors.gold : config.colors.primary)
        .setTitle(crashed ? '💥 CRASHED!' : '📈 Crash')
        .setDescription([
          `${bar}`,
          `**${current.toFixed(2)}x**`,
          '',
          crashed ? `💥 Crashed at **${crashPoint.toFixed(2)}x**` : '⏳ Click Cash Out before it crashes!',
          `Bet: **${bet.toLocaleString()}** ${config.currency}`,
        ].join('\n'))
        .setTimestamp();
    };

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 30000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'crash_cashout' && !cashedOut) {
        cashedOut = true;
        cashOutMult = current;
        collector.stop('cashout');
        await i.deferUpdate();
      }
    });

    // Grow multiplier
    const interval = setInterval(async () => {
      if (cashedOut) { clearInterval(interval); return; }
      current = parseFloat((current + (current < 2 ? 0.05 : current < 5 ? 0.1 : 0.2)).toFixed(2));

      if (current >= crashPoint) {
        clearInterval(interval);
        client.activeGames.delete(gameKey);
        collector.stop('crashed');
        recordGame(message.author.id, false, bet);
        const newBal = getUser(message.author.id).balance;
        const crashEmbed = buildEmbed(true);
        crashEmbed.addFields({ name: '💰 Balance', value: `**${newBal.toLocaleString()}** ${config.currency}` });
        reply.edit({ embeds: [crashEmbed], components: [] }).catch(() => {});
        return;
      }

      reply.edit({ embeds: [buildEmbed()], components: [row] }).catch(() => {});
    }, 600);

    collector.on('end', async (_, reason) => {
      clearInterval(interval);
      client.activeGames.delete(gameKey);
      if (reason === 'cashout') {
        const winnings = Math.floor(bet * cashOutMult);
        addBalance(message.author.id, winnings);
        recordGame(message.author.id, true, winnings - bet);
        const newBal = getUser(message.author.id).balance;
        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('💰 Cashed Out!')
          .setDescription([
            `Cashed out at **${cashOutMult.toFixed(2)}x**`,
            `Won **${winnings.toLocaleString()}** ${config.currency}!`,
            `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
          ].join('\n'))
          .setTimestamp();
        reply.edit({ embeds: [embed], components: [] }).catch(() => {});
      }
    });
  },
};

function buildBar(current, max) {
  const pct = Math.min(current / Math.max(max, 5), 1);
  const filled = Math.floor(pct * 20);
  return `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${(pct * 100).toFixed(0)}%`;
}
