const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const { fmtR } = require('../../utils/gameUtils');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkbalance')
    .setDescription('Check any user\'s balance (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const u = getUser(target.id);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`💰 Balance — ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '💰 Balance',      value: `**${fmtR(u.balance || 0)}** ${config.currency}`,      inline: true },
          { name: '🏦 Vault',        value: `**${fmtR(u.vault || 0)}** ${config.currency}`,        inline: true },
          { name: '💎 Demo Balance', value: `**${fmtR(u.demoBalance || 0)}** ${config.currency}`,  inline: true },
          { name: '📥 Total Deposited', value: `**${fmtR(u.totalDeposited || 0)}** ${config.currency}`, inline: true },
          { name: '📤 Total Withdrawn', value: `**${fmtR(u.totalWithdrawn || 0)}** ${config.currency}`, inline: true },
        )
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
