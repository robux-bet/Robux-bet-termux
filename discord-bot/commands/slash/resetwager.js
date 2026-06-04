const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetwager')
    .setDescription('Clear a user\'s wager requirement (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const u = getUser(target.id);
    const old = u.wagerRequired || 0;
    u.wagerRequired = 0;
    saveUser(target.id, u);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Wager Reset')
        .setDescription(`${target}'s wager requirement cleared.\n\nWas: **${old.toLocaleString()}** ${config.currency} → Now: **0.00** ${config.currency}`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
