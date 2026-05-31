const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'withdraw',
  aliases: ['with'],
  description: 'Open a withdrawal ticket',
  usage: '.withdraw <amount>',
  guildOnly: true,
  async execute(message, args) {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please specify a valid withdrawal amount.\n`Usage: .withdraw <amount>`')] });
    }

    const user = getUser(message.author.id);
    if (user.balance < amount) {
      return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('📤 Withdrawal Request')
      .setDescription([
        `${message.author} has requested a withdrawal of **${amount.toLocaleString()}** ${config.currency}`,
        '',
        '**Instructions:**',
        '1. An admin will review your request',
        '2. Provide your payment details when asked',
        '3. Your balance will be deducted upon approval',
        '',
        '> ⚠️ Do not start another withdrawal until this one is resolved.',
      ].join('\n'))
      .addFields(
        { name: '👤 User', value: `${message.author.tag}`, inline: true },
        { name: '🆔 User ID', value: message.author.id, inline: true },
        { name: `${config.currencyEmoji} Amount`, value: `${amount.toLocaleString()} ${config.currency}`, inline: true },
        { name: '💰 Current Balance', value: `${user.balance.toLocaleString()} ${config.currency}`, inline: true },
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setTimestamp();

    try {
      const thread = await message.channel.threads.create({
        name: `withdraw-${message.author.username}-${amount}`,
        type: 12,
        reason: 'Withdrawal ticket',
        invitable: false,
      });
      await thread.members.add(message.author.id);
      await thread.send({ embeds: [embed] });
      message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.success).setDescription(`✅ Withdrawal ticket created: ${thread}`)] });
    } catch {
      message.reply({ embeds: [embed] });
    }
  },
};
