const { setBalance } = require('../../utils/database');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'setbalance',
  aliases: ['setbal'],
  description: "Set a user's balance to a specific amount",
  usage: '.setbalance @user <amount>',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Please mention a user.\n`Usage: .setbalance @user <amount>`')] });

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 0) return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please provide a valid non-negative amount.')] });

    const newBal = setBalance(target.id, amount);

    message.reply({
      embeds: [
        successEmbed(
          'Balance Set',
          `Set ${target}'s balance to **${newBal.toLocaleString()}** ${config.currency}`
        ).setFooter({ text: `Set by ${message.author.tag}` }),
      ],
    });
  },
};
