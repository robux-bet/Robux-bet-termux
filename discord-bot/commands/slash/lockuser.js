const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockuser')
    .setDescription('Lock a user from gambling (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for lock').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const u = getUser(target.id);

    if (u.locked) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle('⚠️ Already Locked').setDescription(`${target} is already locked.`).setTimestamp()],
        ephemeral: true,
      });
    }

    u.locked = true;
    u.lockReason = reason;
    u.lockedAt   = Date.now();
    u.lockedBy   = interaction.user.id;
    saveUser(target.id, u);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('🔒 User Locked')
        .setDescription(`${target} has been **locked** from gambling.\n\n**Reason:** ${reason}`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
