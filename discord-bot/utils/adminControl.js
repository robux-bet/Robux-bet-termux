const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../config');

/**
 * @param {Message} message
 * @param {string} defaultMode
 * @param {string} gameLabel
 * @param {Message|null} existingMsg
 * @param {null|{label:string, buttons:{label:string,value:string}[]}} extras
 * @returns {Promise<{mode:string, loadMsg:Message, extra:string|null}>}
 */
async function awaitAdminControl(message, defaultMode, gameLabel, existingMsg = null, extras = null) {
  const token = `${message.id}_${Date.now()}`;

  const bars = [
    '`[▓▓▓▓░░░░░░░░░░░░░░░░] 20%`',
    '`[▓▓▓▓▓▓▓▓░░░░░░░░░░░░] 40%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░] 60%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░] 80%`',
    '`[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 100%`',
  ];

  let loadMsg;
  const initEmbed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`🎲 ${gameLabel}`)
    .setDescription('⏳ **Preparing your game...**\n\n`[░░░░░░░░░░░░░░░░░░░░] 0%`')
    .setTimestamp();

  if (existingMsg) {
    await existingMsg.edit({ embeds: [initEmbed], components: [] }).catch(() => {});
    loadMsg = existingMsg;
  } else {
    loadMsg = await message.reply({ embeds: [initEmbed] });
  }

  let chosenMode = null;
  let chosenExtra = null;

  const adminTask = Promise.race([
    (async () => {
      const channelId = config.controlChannelId;
      if (!channelId) return;

      const controlChannel = await Promise.race([
        message.client.channels.fetch(channelId).catch(() => null),
        new Promise(r => setTimeout(() => r(null), 2000)),
      ]);
      if (!controlChannel) return;

      const modeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ac_win_${token}`).setLabel('✅ WIN').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ac_lose_${token}`).setLabel('❌ LOSE').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ac_fair_${token}`).setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary),
      );

      const rows = [modeRow];

      if (extras?.buttons?.length) {
        const extRow = new ActionRowBuilder().addComponents(
          ...extras.buttons.slice(0, 5).map(b =>
            new ButtonBuilder()
              .setCustomId(`acx_${b.value}_${token}`)
              .setLabel(b.label)
              .setStyle(ButtonStyle.Primary)
          )
        );
        rows.push(extRow);
      }

      const controlEmbed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle(`🎮 ${gameLabel} — Override (5s)`)
        .setDescription([
          `**User:** ${message.author.tag} (<@${message.author.id}>)`,
          `**Game:** ${gameLabel}`,
          `**Channel:** <#${message.channel.id}>`,
          `**Default:** \`${defaultMode}\``,
          extras ? `\n**${extras.label}:** Pick a button below` : '',
          '',
          '> WIN/LOSE/FAIR overrides outcome.',
          extras ? '> Extra buttons set specific game parameters.' : '',
        ].join('\n'))
        .setTimestamp();

      const ctrlMsg = await Promise.race([
        controlChannel.send({ embeds: [controlEmbed], components: rows }).catch(() => null),
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
          await i.deferUpdate().catch(() => {});
          if (i.customId.startsWith('ac_')) {
            chosenMode = i.customId.split('_')[1]; // win/lose/fair
          } else if (i.customId.startsWith('acx_')) {
            const parts = i.customId.split('_');
            chosenExtra = parts[1]; // the value
            if (!chosenMode) chosenMode = 'lose'; // extras imply lose by default
          }
        });

        collector.on('end', () => {
          const disabledModeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ac_win_${token}`).setLabel('✅ WIN').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`ac_lose_${token}`).setLabel('❌ LOSE').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId(`ac_fair_${token}`).setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary).setDisabled(true),
          );
          const disabledRows = [disabledModeRow];
          if (extras?.buttons?.length) {
            disabledRows.push(new ActionRowBuilder().addComponents(
              ...extras.buttons.slice(0, 5).map(b =>
                new ButtonBuilder().setCustomId(`acx_${b.value}_${token}`).setLabel(b.label).setStyle(ButtonStyle.Primary).setDisabled(true)
              )
            ));
          }
          const summary = chosenExtra
            ? `⚙️ Param: **${chosenExtra}** | Mode: **${(chosenMode || defaultMode).toUpperCase()}**`
            : chosenMode
              ? `✔ Mode: **${chosenMode.toUpperCase()}** for ${message.author.tag}`
              : `⏰ No override — \`${defaultMode}\` applied`;
          ctrlMsg.edit({
            embeds: [new EmbedBuilder().setColor(chosenMode ? config.colors.success : config.colors.primary)
              .setTitle(`🎮 ${gameLabel} — Done`).setDescription(summary).setTimestamp()],
            components: disabledRows,
          }).catch(() => {});
          resolve();
        });
      });
    })(),
    new Promise(r => setTimeout(r, 4800)),
  ]);

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

  return { mode: chosenMode || defaultMode, loadMsg, extra: chosenExtra };
}

module.exports = { awaitAdminControl };
