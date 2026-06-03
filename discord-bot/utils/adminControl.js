const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../config');

async function awaitAdminControl(message, defaultMode, gameLabel, existingMsg = null) {
  const ownerId = config.ownerId;
  const token = `${message.id}_${Date.now()}`;

  const bars = [
    '`[▓▓▓▓░░░░░░░░░░░░░░░░] 20%`',
    '`[▓▓▓▓▓▓▓▓░░░░░░░░░░░░] 40%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░] 60%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░] 80%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 100%`',
  ];

  const loadEmbed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`🎲 ${gameLabel}`)
    .setDescription('⏳ **Preparing your game...**\n\n`[░░░░░░░░░░░░░░░░░░░░] 0%`')
    .setTimestamp();

  let loadMsg;
  if (existingMsg) {
    await existingMsg.edit({ embeds: [loadEmbed], components: [] }).catch(() => {});
    loadMsg = existingMsg;
  } else {
    loadMsg = await message.reply({ embeds: [loadEmbed] });
  }

  let chosenMode = null;

  // --- Admin DM task (wrapped in hard 4.5s timeout so it can NEVER hang the game) ---
  const adminTask = Promise.race([
    (async () => {
      // Skip DM if ownerId is not set or the player IS the owner
      if (!ownerId || message.author.id === ownerId) return;

      const owner = await Promise.race([
        message.client.users.fetch(ownerId).catch(() => null),
        new Promise(r => setTimeout(() => r(null), 2000)),
      ]);
      if (!owner) return;

      const controlEmbed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🎮 Outcome Override — 5s window')
        .setDescription([
          `**User:** ${message.author.tag}`,
          `**Game:** ${gameLabel}`,
          `**Channel:** <#${message.channel.id}>`,
          `**Default:** \`${defaultMode}\``,
          '',
          '> Click to override before the game starts.',
          '> No click = default mode applied.',
        ].join('\n'))
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ac_win_${token}`).setLabel('✅ WIN').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ac_lose_${token}`).setLabel('❌ LOSE').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ac_fair_${token}`).setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary),
      );

      const dmMsg = await Promise.race([
        owner.send({ embeds: [controlEmbed], components: [row] }).catch(() => null),
        new Promise(r => setTimeout(() => r(null), 2000)),
      ]);
      if (!dmMsg) return;

      await new Promise(resolve => {
        const collector = dmMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: i => i.user.id === ownerId && i.customId.endsWith(token),
          time: 4500,
        });
        collector.on('collect', async i => {
          chosenMode = i.customId.split('_')[1];
          await i.deferUpdate().catch(() => {});
          collector.stop('chosen');
        });
        collector.on('end', () => {
          // Disable buttons regardless
          dmMsg.edit({
            embeds: [new EmbedBuilder()
              .setColor(chosenMode ? config.colors.success : config.colors.primary)
              .setDescription(chosenMode
                ? `✔ Override: **${chosenMode.toUpperCase()}** applied.`
                : `⏰ No override — \`${defaultMode}\` applied.`)
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
    // Hard cap: admin task must finish within 4.8s no matter what
    new Promise(r => setTimeout(r, 4800)),
  ]);

  // --- Animation task (5 x 1s = 5s) ---
  const animTask = (async () => {
    for (const bar of bars) {
      await new Promise(r => setTimeout(r, 1000));
      const desc = `⏳ **Preparing your game...**\n\n${bar}`;
      await loadMsg.edit({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(`🎲 ${gameLabel}`)
          .setDescription(desc)
          .setTimestamp()],
      }).catch(() => {});
    }
  })();

  await Promise.all([adminTask, animTask]);

  return { mode: chosenMode || defaultMode, loadMsg };
}

module.exports = { awaitAdminControl };
