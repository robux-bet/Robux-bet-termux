const { removeBalance } = require('../../utils/database');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'remove',
  description: 'Remove Robux from a user',
  usage: '.remove @user <amount>',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Please mention a user.\n`Usage: .remove @user <amount>`')] });

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please provide a valid positive amount.')] });

    const newBal = removeBalance(target.id, amount);

    message.reply({
      embeds: [
        successEmbed(
          'Balance Removed',
          `Removed **${amount.toLocaleString()}** ${config.currency} from ${target}\n\n${target}'s new balance: **${newBal.toLocaleString()}** ${config.currency}`
        ).setFooter({ text: `Removed by ${message.author.tag}` }),
      ],
    });
  },
};
