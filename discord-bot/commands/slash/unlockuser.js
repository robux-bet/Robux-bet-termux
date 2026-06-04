const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlockuser')
    .setDescription('Unlock a user from gambling (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const u = getUser(target.id);

    if (!u.locked) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle('⚠️ Not Locked').setDescription(`${target} is not currently locked.`).setTimestamp()],
        ephemeral: true,
      });
    }

    u.locked = false;
    delete u.lockReason;
    delete u.lockedAt;
    delete u.lockedBy;
    saveUser(target.id, u);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🔓 User Unlocked')
        .setDescription(`${target} can now gamble again.`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
