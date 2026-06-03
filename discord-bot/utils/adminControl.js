const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../config');

/**
 * Shows a 5-second animated loading screen in the channel while simultaneously
 * DMing the owner with WIN / LOSE / FAIR override buttons.
 *
 * @param {import('discord.js').Message} message - Original command message
 * @param {string} defaultMode - Outcome from getRiggedMode ('win','lose','fair','allin_win')
 * @param {string} gameLabel  - Display name shown in loading embed, e.g. 'Blackjack'
 * @param {import('discord.js').Message|null} existingMsg - If given, edits this instead of replying
 * @returns {Promise<{ mode: string, loadMsg: import('discord.js').Message }>}
 */
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
  let dmMsg = null;

  const adminTask = (async () => {
    if (!ownerId || message.author.id === ownerId) return;
    const owner = await message.client.users.fetch(ownerId).catch(() => null);
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

    dmMsg = await owner.send({ embeds: [controlEmbed], components: [row] }).catch(() => null);
    if (!dmMsg) return;

    await new Promise(resolve => {
      const collector = dmMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === ownerId && i.customId.endsWith(token),
        time: 4800,
      });
      collector.on('collect', async i => {
        chosenMode = i.customId.split('_')[1];
        await i.deferUpdate();
        collector.stop('chosen');
      });
      collector.on('end', () => resolve());
    });
  })();

  const animTask = (async () => {
    for (const bar of bars) {
      await new Promise(r => setTimeout(r, 1000));
      loadEmbed.setDescription(`⏳ **Preparing your game...**\n\n${bar}`);
      await loadMsg.edit({ embeds: [loadEmbed] }).catch(() => {});
    }
  })();

  await Promise.all([adminTask, animTask]);

  if (dmMsg) {
    const modeDisplay = { win: '✅ WIN', lose: '❌ LOSE', fair: '🎲 FAIR', allin_win: '✅ WIN (All-in)' };
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ac_win_${token}`).setLabel('✅ WIN').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId(`ac_lose_${token}`).setLabel('❌ LOSE').setStyle(ButtonStyle.Danger).setDisabled(true),
      new ButtonBuilder().setCustomId(`ac_fair_${token}`).setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    dmMsg.edit({
      embeds: [new EmbedBuilder()
        .setColor(chosenMode ? config.colors.success : config.colors.primary)
        .setDescription(chosenMode
          ? `✔ Override applied: **${modeDisplay[chosenMode] || chosenMode}**`
          : `⏰ No override — \`${defaultMode}\` applied.`)
        .setTimestamp()],
      components: [disabledRow],
    }).catch(() => {});
  }

  return { mode: chosenMode || defaultMode, loadMsg };
}

module.exports = { awaitAdminControl };
