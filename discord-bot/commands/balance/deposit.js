const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'deposit',
  aliases: ['depo'],
  description: 'Open a deposit ticket',
  usage: '.deposit <amount>',
  guildOnly: true,
  async execute(message, args) {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please specify a valid deposit amount.\n`Usage: .deposit <amount>`')] });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📥 Deposit Request')
      .setDescription([
        `${message.author} has requested a deposit of **${amount.toLocaleString()}** ${config.currency}`,
        '',
        '**Instructions:**',
        '1. Send the specified amount via the agreed payment method',
        '2. An admin will review and add your balance',
        '3. Do not close this ticket until confirmed',
        '',
        '> ⚠️ This is for virtual currency only.',
      ].join('\n'))
      .addFields(
        { name: '👤 User', value: `${message.author.tag}`, inline: true },
        { name: '🆔 User ID', value: message.author.id, inline: true },
        { name: `${config.currencyEmoji} Amount`, value: `${amount.toLocaleString()} ${config.currency}`, inline: true },
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setTimestamp();

    // Try to create a private thread for the ticket
    try {
      const thread = await message.channel.threads.create({
        name: `deposit-${message.author.username}-${amount}`,
        type: 12, // PrivateThread
        reason: 'Deposit ticket',
        invitable: false,
      });
      await thread.members.add(message.author.id);
      await thread.send({ embeds: [embed] });
      message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.success).setDescription(`✅ Deposit ticket created: ${thread}`)] });
    } catch {
      // Fallback: just post the embed
      message.reply({ embeds: [embed] });
    }
  },
};
