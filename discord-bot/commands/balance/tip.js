const { getUser, removeBalance, addBalance } = require('../../utils/database');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'tip',
  description: 'Tip another user some of your Robux',
  usage: '.tip @user <amount>',
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Mention a user to tip.\n`Usage: .tip @user <amount>`')] });
    if (target.id === message.author.id) return message.reply({ embeds: [errorEmbed('Invalid', 'You cannot tip yourself.')] });
    if (target.bot) return message.reply({ embeds: [errorEmbed('Invalid', 'You cannot tip a bot.')] });

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Provide a valid positive amount.')] });

    const sender = getUser(message.author.id);
    if (sender.balance < amount) {
      return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${sender.balance.toLocaleString()}** ${config.currency}`)] });
    }

    removeBalance(message.author.id, amount);
    addBalance(target.id, amount);

    const newBal = getUser(message.author.id).balance;
    message.reply({
      embeds: [
        successEmbed(
          'Tip Sent!',
          `${message.author} tipped ${target} **${amount.toLocaleString()}** ${config.currency} 💸\n\n${message.author}'s remaining balance: **${newBal.toLocaleString()}** ${config.currency}`
        ),
      ],
    });
  },
};
