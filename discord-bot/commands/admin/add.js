const { addBalance } = require('../../utils/database');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'add',
  description: 'Add Robux to a user',
  usage: '.add @user <amount>',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Please mention a user.\n`Usage: .add @user <amount>`')] });

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please provide a valid positive amount.')] });

    const newBal = addBalance(target.id, amount);

    message.reply({
      embeds: [
        successEmbed(
          'Balance Added',
          `Added **${amount.toLocaleString()}** ${config.currency} to ${target}\n\n${target}'s new balance: **${newBal.toLocaleString()}** ${config.currency}`
        ).setFooter({ text: `Added by ${message.author.tag}` }),
      ],
    });
  },
};
