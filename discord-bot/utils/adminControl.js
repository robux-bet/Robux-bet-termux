const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../config');

async function awaitAdminControl(message, defaultMode, gameLabel, existingMsg = null) {
  const token = `${message.id}_${Date.now()}`;

  const bars = [
    '`[▓▓▓▓░░░░░░░░░░░░░░░░] 20%`',
    '`[▓▓▓▓▓▓▓▓░░░░░░░░░░░░] 40%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░] 60%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░] 80%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 100%`',
  ];

  const loadEmbed = () => new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`🎲 ${gameLabel}`)
    .setDescription('⏳ **Preparing your game...**\n\n`[░░░░░░░░░░░░░░░░░░░░] 0%`')
    .setTimestamp();

  let loadMsg;
  if (existingMsg) {
    await existingMsg.edit({ embeds: [loadEmbed()], components: [] }).catch(() => {});
    loadMsg = existingMsg;
  } else {
    loadMsg = await message.reply({ embeds: [loadEmbed()] });
  }

  let chosenMode = null;

  // --- Control panel task (posts to admin channel, hard 4.8s cap) ---
  const adminTask = Promise.race([
    (async () => {
      const channelId = config.controlChannelId;
      if (!channelId) return;

      const controlChannel = await Promise.race([
        message.client.channels.fetch(channelId).catch(() => null),
        new Promise(r => setTimeout(() => r(null), 2000)),
      ]);
      if (!controlChannel) return;

      const controlEmbed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🎮 Outcome Override — 5s window')
        .setDescription([
          `**User:** ${message.author.tag} (<@${message.author.id}>)`,
          `**Game:** ${gameLabel}`,
          `**Channel:** <#${message.channel.id}>`,
          `**Default:** \`${defaultMode}\``,
          '',
          '> Click WIN / LOSE / FAIR before the game starts.',
          '> No click = default applied automatically.',
        ].join('\n'))
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ac_win_${token}`).setLabel('✅ WIN').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ac_lose_${token}`).setLabel('❌ LOSE').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ac_fair_${token}`).setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary),
      );

      const ctrlMsg = await Promise.race([
        controlChannel.send({ embeds: [controlEmbed], components: [row] }).catch(() => null),
        new Promise(r => setTimeout(() => r(null), 2000)),
      ]);
      if (!ctrlMsg) return;

      await new Promise(resolve => {
        const collector = ctrlMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: i => {
            const isOwner = i.user.id === config.ownerId;
            const isAdmin = i.member?.permissions?.has('Administrator') ||
              config.adminRoleIds.some(id => i.member?.roles?.cache?.has(id));
            return (isOwner || isAdmin) && i.customId.endsWith(token);
          },
          time: 4500,
        });

        collector.on('collect', async i => {
          chosenMode = i.customId.split('_')[1];
          await i.deferUpdate().catch(() => {});
          collector.stop('chosen');
        });

        collector.on('end', () => {
          ctrlMsg.edit({
            embeds: [new EmbedBuilder()
              .setColor(chosenMode ? config.colors.success : config.colors.primary)
              .setTitle('🎮 Outcome Override')
              .setDescription(chosenMode
                ? `✔ **${chosenMode.toUpperCase()}** override applied for ${message.author.tag}`
                : `⏰ No override — \`${defaultMode}\` applied for ${message.author.tag}`)
              .setTimestamp()],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`ac_win_${token}`).setLabel('✅ WIN').setStyle(ButtonStyle.Success).setDisabled(true),
              new ButtonBuilder().setCustomId(`ac_lose_${token}`).setLabel('❌ LOSE').setStyle(ButtonStyle.Danger).setDisabled(true),
              new ButtonBuilder().setCustomId(`ac_fair_${token}`).setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary).setDisabled(true),
            )],
          }).catch(() => {});
          resolve();
        });
      });
    })(),
    new Promise(r => setTimeout(r, 4800)),
  ]);

  // --- Animation task (5 x 1s = 5s) ---
  const animTask = (async () => {
    for (const bar of bars) {
      await new Promise(r => setTimeout(r, 1000));
      await loadMsg.edit({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(`🎲 ${gameLabel}`)
          .setDescription(`⏳ **Preparing your game...**\n\n${bar}`)
          .setTimestamp()],
      }).catch(() => {});
    }
  })();

  await Promise.all([adminTask, animTask]);

  return { mode: chosenMode || defaultMode, loadMsg };
}

module.exports = { awaitAdminControl };
