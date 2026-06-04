const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setBalance, getUser } = require('../../utils/database');
const { fmtR } = require('../../utils/gameUtils');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbalance')
    .setDescription('Set a user\'s balance to an exact amount (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addNumberOption(o => o.setName('amount').setDescription('New balance amount').setRequired(true).setMinValue(0)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getNumber('amount');

    const newBal = setBalance(target.id, amount);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Balance Set')
        .setDescription(`${target}'s balance has been set to **${fmtR(newBal)}** ${config.currency}`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
