const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAllUsers } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('DM an announcement to all users (admin only)')
    .addStringOption(o => o.setName('message').setDescription('Message to broadcast').setRequired(true)),

  async execute(interaction, client) {
    const text = interaction.options.getString('message');
    await interaction.deferReply({ ephemeral: true });

    const users   = getAllUsers();
    const userIds = Object.keys(users);
    let sent = 0, failed = 0;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📢 Casino Announcement')
      .setDescription(text)
      .setFooter({ text: `discord.gg/${config.serverInvite}` })
      .setTimestamp();

    for (const uid of userIds) {
      try {
        const u = await client.users.fetch(uid).catch(() => null);
        if (!u || u.bot) { failed++; continue; }
        await u.send({ embeds: [embed] });
        sent++;
      } catch { failed++; }
    }

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('📢 Broadcast Complete')
        .setDescription(`**Sent:** ${sent} · **Failed:** ${failed}`)
        .setTimestamp()],
    });
  },
};
