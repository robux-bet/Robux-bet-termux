const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const MAX_PUMPS = 20;
const POP_CHANCE_BASE = 0.05; // 5% per pump, increases with each pump

module.exports = {
  name: 'balloon',
  description: 'Pump the balloon — cash out before it pops! Risk vs Reward',
  usage: '.balloon <bet>',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .balloon <bet>`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `balloon_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current balloon game!')] });

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'Balloon', userId: message.author.id, bet });

    let pumps = 0;
    let gameOver = false;
    const popAt = Math.floor(Math.random() * MAX_PUMPS) + 3; // Random pop point

    const getMultiplier = () => parseFloat((1 + pumps * 0.15).toFixed(2));

    const BALLOON_SIZES = ['🎈', '🎈', '🎈🎈', '🎈🎈', '🎈🎈🎈', '💨'];

    const buildEmbed = (status = '') => {
      const mult = getMultiplier();
      const size = pumps === 0 ? '—' : BALLOON_SIZES[Math.min(pumps - 1, BALLOON_SIZES.length - 1)];
      const bar = `[${'█'.repeat(Math.min(pumps, 20))}${'░'.repeat(Math.max(0, 20 - pumps))}]`;
      return new EmbedBuilder()
        .setColor(pumps > 15 ? config.colors.error : pumps > 8 ? config.colors.warning : config.colors.primary)
        .setTitle('🎈 Balloon')
        .setDescription([
          `${size} **Balloon size:** ${pumps} pumps`,
          `${bar}`,
          `Multiplier: **${mult}x** | Potential: **${Math.floor(bet * mult).toLocaleString()}** ${config.currency}`,
          '',
          status || '💨 Keep pumping or cash out!',
        ].join('\n'))
        .setTimestamp();
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('balloon_pump').setLabel('💨 Pump').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('balloon_cash').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success),
    );

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'balloon_cash') {
        if (pumps === 0) { await i.reply({ content: 'Pump at least once!', ephemeral: true }); return; }
        const mult = getMultiplier();
        const winnings = Math.floor(bet * mult);
        addBalance(message.author.id, winnings);
        recordGame(message.author.id, true, winnings - bet);
        const newBal = getUser(message.author.id).balance;
        gameOver = true;
        client.activeGames.delete(gameKey);
        collector.stop();
        await i.update({
          embeds: [buildEmbed(`💰 Cashed out at **${mult}x**! Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`)],
          components: [],
        }).catch(() => {});
        return;
      }

      pumps++;
      const popChance = Math.min(0.05 + (pumps / MAX_PUMPS) * 0.5, 0.9);

      if (pumps >= popAt || Math.random() < popChance) {
        gameOver = true;
        recordGame(message.author.id, false, bet);
        const newBal = getUser(message.author.id).balance;
        client.activeGames.delete(gameKey);
        collector.stop();
        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('💥 POP!').setDescription([
            `The balloon **popped** after **${pumps}** pumps!`,
            `Lost **${bet.toLocaleString()}** ${config.currency}.`,
            `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
          ].join('\n')).setTimestamp()],
          components: [],
        }).catch(() => {});
      } else {
        await i.update({ embeds: [buildEmbed()], components: [row] }).catch(() => {});
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        if (pumps > 0) addBalance(message.author.id, Math.floor(bet * getMultiplier()));
        else addBalance(message.author.id, bet);
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
