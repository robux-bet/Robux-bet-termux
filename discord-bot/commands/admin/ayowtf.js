const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, ComponentType } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const config = require('../../config');

const OUTCOMES = {
  win:  { label: '✅ WIN',  style: ButtonStyle.Success,   desc: 'will **WIN** their next game' },
  lose: { label: '❌ LOSE', style: ButtonStyle.Danger,    desc: 'will **LOSE** their next game' },
  fair: { label: '🎲 FAIR', style: ButtonStyle.Secondary, desc: 'plays **FAIR** (no rig) next game' },
};

function buildHomeEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🎮 Outcome Control Panel')
    .setDescription([
      'Select a player below to force their next game outcome.',
      '',
      '**Modes:**',
      '> ✅ **WIN** — forces their next game to win',
      '> ❌ **LOSE** — forces their next game to lose',
      '> 🎲 **FAIR** — skips all rigging for one game',
      '> 🔄 **Reset** — removes any forced override',
    ].join('\n'))
    .setFooter({ text: 'One override per player · clears automatically after their next game' })
    .setTimestamp();
}

function buildUserEmbed(targetTag, targetId, avatarURL) {
  const u = getUser(targetId);
  const current = u.forceNextOutcome
    ? OUTCOMES[u.forceNextOutcome]?.desc ?? u.forceNextOutcome
    : '*(none — using default rigging)*';

  return new EmbedBuilder()
    .setColor(config.colors.gold)
    .setTitle(`🎮 ${targetTag}`)
    .setThumbnail(avatarURL)
    .setDescription([
      `**Current override:** ${current}`,
      '',
      'Pick an outcome for their **next game only** — it clears the moment they finish a game.',
    ].join('\n'))
    .setFooter({ text: `User ID: ${targetId}` })
    .setTimestamp();
}

module.exports = {
  name: 'ayowtf',
  description: 'Force a player\'s next game outcome',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args, client) {
    const selectRow = () => new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('ayw_select')
        .setPlaceholder('🔍 Select a player...')
        .setMinValues(1)
        .setMaxValues(1),
    );

    const btnRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ayw_back').setLabel('← Back').setStyle(ButtonStyle.Secondary),
    );

    const reply = await message.reply({
      embeds: [buildHomeEmbed()],
      components: [selectRow()],
    });

    let selectedId = null;
    let selectedTag = null;
    let selectedAvatar = null;

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async i => {
      // ── User selected ──────────────────────────────────────────
      if (i.customId === 'ayw_select') {
        selectedId = i.values[0];
        const target = await client.users.fetch(selectedId).catch(() => null);
        selectedTag = target?.tag ?? selectedId;
        selectedAvatar = target?.displayAvatarURL() ?? null;

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ayw_win').setLabel('✅ WIN').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ayw_lose').setLabel('❌ LOSE').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ayw_fair').setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ayw_reset').setLabel('🔄 Reset').setStyle(ButtonStyle.Secondary),
        );

        await i.update({
          embeds: [buildUserEmbed(selectedTag, selectedId, selectedAvatar)],
          components: [actionRow, btnRow()],
        });
        return;
      }

      // ── Back to home ──────────────────────────────────────────
      if (i.customId === 'ayw_back') {
        selectedId = null;
        await i.update({ embeds: [buildHomeEmbed()], components: [selectRow()] });
        return;
      }

      // ── Outcome buttons ───────────────────────────────────────
      if (!selectedId) return i.deferUpdate();

      const u = getUser(selectedId);
      let confirmLine;

      if (i.customId === 'ayw_reset') {
        delete u.forceNextOutcome;
        confirmLine = `🔄 **Reset** — override cleared for **${selectedTag}**. They'll use default rigging.`;
      } else {
        const key = i.customId.replace('ayw_', '');
        u.forceNextOutcome = key;
        confirmLine = `${OUTCOMES[key].label} set — **${selectedTag}** ${OUTCOMES[key].desc}.`;
      }

      saveUser(selectedId, u);

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ayw_win').setLabel('✅ WIN').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ayw_lose').setLabel('❌ LOSE').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ayw_fair').setLabel('🎲 FAIR').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ayw_reset').setLabel('🔄 Reset').setStyle(ButtonStyle.Secondary),
      );

      const embed = buildUserEmbed(selectedTag, selectedId, selectedAvatar)
        .setColor(config.colors.success)
        .addFields({ name: '✔ Applied', value: confirmLine });

      await i.update({ embeds: [embed], components: [actionRow, btnRow()] });
    });

    collector.on('end', () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};
