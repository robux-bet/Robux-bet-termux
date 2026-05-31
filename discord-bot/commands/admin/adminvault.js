const { getUser, setVault, getVault } = require('../../utils/database');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'adminvault',
  description: "Manage a user's vault balance",
  usage: '.adminvault @user <set|add|remove> <amount>',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Please mention a user.\n`Usage: .adminvault @user <set|add|remove|view> <amount>`')] });

    const action = args[1]?.toLowerCase();
    if (!action) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Provide an action: `set`, `add`, `remove`, or `view`')] });

    const user = getUser(target.id);
    const currentVault = user.vault || 0;

    if (action === 'view') {
      return message.reply({
        embeds: [infoEmbed('🏦 Vault Info', `${target}'s vault balance: **${currentVault.toLocaleString()}** ${config.currency}`)],
      });
    }

    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount < 0) return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please provide a valid amount.')] });

    let newVault;
    if (action === 'set') {
      newVault = setVault(target.id, amount);
    } else if (action === 'add') {
      newVault = setVault(target.id, currentVault + amount);
    } else if (action === 'remove') {
      newVault = setVault(target.id, Math.max(0, currentVault - amount));
    } else {
      return message.reply({ embeds: [errorEmbed('Invalid Action', 'Use `set`, `add`, `remove`, or `view`.')] });
    }

    message.reply({
      embeds: [
        successEmbed('Vault Updated', `${target}'s vault: **${newVault.toLocaleString()}** ${config.currency}`)
          .setFooter({ text: `Updated by ${message.author.tag}` }),
      ],
    });
  },
};
