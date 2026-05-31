const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ComponentType } = require('discord.js');
const { getUser, addBalance } = require('../../utils/database');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'deposit',
  aliases: ['depo'],
  description: 'Open a deposit ticket channel',
  usage: '.deposit <amount>',
  guildOnly: true,
  async execute(message, args) {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please specify how much you want to deposit.\n`Usage: .deposit <amount>`')] });
    }

    // Try to create a proper channel under a category named "Tickets" or in the same category
    let ticketChannel;
    try {
      const parentCategory = message.channel.parentId;
      ticketChannel = await message.guild.channels.create({
        name: `deposit-${message.author.username}-${amount}`,
        type: ChannelType.GuildText,
        parent: parentCategory || null,
        permissionOverwrites: [
          {
            id: message.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: message.author.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
          {
            id: message.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      });

      // Add admin role if configured
      if (config.adminRoleId) {
        await ticketChannel.permissionOverwrites.create(config.adminRoleId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      }
    } catch (err) {
      return message.reply({ embeds: [errorEmbed('Permission Error', 'I need **Manage Channels** permission to create deposit ticket channels.')] });
    }

    const user = getUser(message.author.id);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📥 Deposit Request')
      .setDescription([
        `${message.author} has requested a deposit of **${amount.toLocaleString()}** ${config.currency}.`,
        '',
        '**Instructions:**',
        '1. Send proof of payment in this channel',
        '2. An admin will review and approve or deny',
        '3. Do **not** close this channel until it is resolved',
        '',
        '> ⚠️ This is for **virtual currency** only.',
      ].join('\n'))
      .addFields(
        { name: '👤 User', value: `${message.author.tag}`, inline: true },
        { name: '🆔 User ID', value: message.author.id, inline: true },
        { name: `${config.currencyEmoji} Amount`, value: `${amount.toLocaleString()} ${config.currency}`, inline: true },
        { name: '💰 Current Balance', value: `${user.balance.toLocaleString()} ${config.currency}`, inline: true },
        { name: '💎 Demo Balance', value: `${(user.demoBalance || 0).toLocaleString()} ${config.currency}`, inline: true },
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setTimestamp();

    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dep_approve_${message.author.id}_${amount}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dep_deny_${message.author.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dep_close').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Secondary),
    );

    const ticketMsg = await ticketChannel.send({
      content: `${message.author} | Admin action required ↓`,
      embeds: [embed],
      components: [adminRow],
    });

    // Collector for admin buttons
    const collector = ticketMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    collector.on('collect', async i => {
      const isAdmin = i.member.permissions.has(PermissionFlagsBits.Administrator) ||
        (config.adminRoleId && i.member.roles.cache.has(config.adminRoleId));

      if (!isAdmin) {
        return i.reply({ content: '❌ Only admins can approve or deny tickets.', ephemeral: true });
      }

      if (i.customId.startsWith('dep_approve_')) {
        const [, , uid, amt] = i.customId.split('_');
        addBalance(uid, parseInt(amt));
        const depUser = getUser(uid); depUser.lastDeposited = Date.now(); require('../../utils/database').saveUser(uid, depUser);
        const newBal = getUser(uid).balance;
        collector.stop();
        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Deposit Approved')
            .setDescription([
              `Deposit of **${parseInt(amt).toLocaleString()}** ${config.currency} has been approved by ${i.user}.`,
              `New actual balance: **${newBal.toLocaleString()}** ${config.currency}`,
            ].join('\n')).setTimestamp()],
          components: [],
        });
        // Notify user
        const targetUser = await i.client.users.fetch(uid).catch(() => null);
        if (targetUser) targetUser.send(`✅ Your deposit of **${parseInt(amt).toLocaleString()}** ${config.currency} was approved! New balance: **${newBal.toLocaleString()}**`).catch(() => {});
        setTimeout(() => ticketChannel.delete('Deposit ticket resolved').catch(() => {}), 10000);
      } else if (i.customId.startsWith('dep_deny_')) {
        collector.stop();
        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Deposit Denied')
            .setDescription(`Deposit denied by ${i.user}. Contact an admin if you believe this is an error.`).setTimestamp()],
          components: [],
        });
        const uid = i.customId.split('_')[2];
        const targetUser = await i.client.users.fetch(uid).catch(() => null);
        if (targetUser) targetUser.send(`❌ Your deposit request was denied. Contact an admin for more info.`).catch(() => {});
        setTimeout(() => ticketChannel.delete('Deposit ticket denied').catch(() => {}), 10000);
      } else if (i.customId === 'dep_close') {
        if (!isAdmin) return i.reply({ content: 'Only admins can close tickets.', ephemeral: true });
        collector.stop();
        await i.reply({ content: '🔒 Closing ticket in 5 seconds...' });
        setTimeout(() => ticketChannel.delete('Ticket closed').catch(() => {}), 5000);
      }
    });

    // Confirm to the user
    message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setDescription(`✅ Deposit ticket created: ${ticketChannel}\nAn admin will review it shortly.`)
        .setTimestamp()],
    }).catch(() => {});
  },
};
