const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetdemo')
    .setDescription('Reset a user\'s demo balance back to 1,000 (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const u = getUser(target.id);
    u.demoBalance     = 1000;
    u.hasClaimedDemo  = false;
    u.demoGamesPlayed = 0;
    saveUser(target.id, u);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🎁 Demo Reset')
        .setDescription(`${target}'s demo balance reset to **1,000.00** ${config.currency}`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
