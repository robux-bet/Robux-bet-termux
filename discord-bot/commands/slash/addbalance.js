const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addBalance, getUser, saveUser } = require('../../utils/database');
const { fmtR } = require('../../utils/gameUtils');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addbalance')
    .setDescription('Add Robux to a user (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addNumberOption(o => o.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(0.01)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getNumber('amount');

    const newBal = addBalance(target.id, amount);
    const u = getUser(target.id);
    u.totalDeposited = (u.totalDeposited || 0) + amount;
    saveUser(target.id, u);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Balance Added')
        .setDescription(`Added **${fmtR(amount)}** ${config.currency} to ${target}\n\nNew balance: **${fmtR(newBal)}** ${config.currency}`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
