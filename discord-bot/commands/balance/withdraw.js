const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ComponentType } = require('discord.js');
const { getUser, removeBalance } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'withdraw',
  aliases: ['with'],
  description: 'Open a withdrawal ticket channel',
  usage: '.withdraw <amount>',
  guildOnly: true,
  async execute(message, args) {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Please specify how much you want to withdraw.\n`Usage: .withdraw <amount>`')] });
    }

    const user = getUser(message.author.id);
    if (user.balance < amount) {
      return message.reply({ embeds: [errorEmbed('Insufficient Actual Balance', [
        `You only have **${user.balance.toLocaleString()}** actual ${config.currency}.`,
        `Demo balance cannot be withdrawn.`,
      ].join('\n'))] });
    }

    if ((user.wagerRequired || 0) > 0) {
      return message.reply({ embeds: [errorEmbed('Wager Requirement Not Met', [
        `You must wager **${user.wagerRequired.toLocaleString()}** more ${config.currency} before you can withdraw.`,
        ``,
        `Play any game with your real balance to work it off.`,
      ].join('\n'))] });
    }

    let ticketChannel;
    try {
      const parentCategory = message.channel.parentId;
      ticketChannel = await message.guild.channels.create({
        name: `withdraw-${message.author.username}-${amount}`,
        type: ChannelType.GuildText,
        parent: parentCategory || null,
        permissionOverwrites: [
          { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
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

      if (config.adminRoleId) {
        await ticketChannel.permissionOverwrites.create(config.adminRoleId, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
        });
      }
    } catch {
      return message.reply({ embeds: [errorEmbed('Permission Error', 'I need **Manage Channels** permission to create withdrawal ticket channels.')] });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('📤 Withdrawal Request')
      .setDescription([
        `${message.author} has requested a withdrawal of **${amount.toLocaleString()}** ${config.currency}.`,
        '',
        '**Process:**',
        '1. Provide your payment details in this channel',
        '2. An admin will approve or deny the request',
        '3. Your balance will be deducted **only after approval**',
        '',
        '> ⚠️ Only **actual** Robux can be withdrawn.',
      ].join('\n'))
      .addFields(
        { name: '👤 User', value: `${message.author.tag}`, inline: true },
        { name: '🆔 User ID', value: message.author.id, inline: true },
        { name: `${config.currencyEmoji} Requested`, value: `${amount.toLocaleString()} ${config.currency}`, inline: true },
        { name: '💰 Actual Balance', value: `${user.balance.toLocaleString()} ${config.currency}`, inline: true },
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setTimestamp();

    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wd_approve_${message.author.id}_${amount}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wd_deny_${message.author.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('wd_close').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Secondary),
    );

    const ticketMsg = await ticketChannel.send({
      content: `${message.author} | Admin action required ↓`,
      embeds: [embed],
      components: [adminRow],
    });

    // Ping owner
    if (config.ownerId) {
      const owner = await message.client.users.fetch(config.ownerId).catch(() => null);
      if (owner) owner.send(`📤 **New Withdrawal Ticket**\n**User:** ${message.author.tag} (\`${message.author.id}\`)\n**Amount:** ${amount.toLocaleString()} ${config.currency}\n**Channel:** ${ticketChannel}`).catch(() => {});
    }

    const collector = ticketMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 7 * 24 * 60 * 60 * 1000,
    });

    collector.on('collect', async i => {
      const isAdmin = i.member.permissions.has(PermissionFlagsBits.Administrator) ||
        (config.adminRoleId && i.member.roles.cache.has(config.adminRoleId));

      if (!isAdmin) return i.reply({ content: '❌ Only admins can approve or deny tickets.', ephemeral: true });

      if (i.customId.startsWith('wd_approve_')) {
        const [, , uid, amt] = i.customId.split('_');
        const currentUser = getUser(uid);
        if (currentUser.balance < parseInt(amt)) {
          return i.reply({ content: `❌ User no longer has enough balance! Has: **${currentUser.balance}**, needs: **${amt}**`, ephemeral: true });
        }
        removeBalance(uid, parseInt(amt));
        const newBal = getUser(uid).balance;
        collector.stop();
        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Withdrawal Approved')
            .setDescription([
              `Withdrawal of **${parseInt(amt).toLocaleString()}** ${config.currency} approved by ${i.user}.`,
              `Remaining actual balance: **${newBal.toLocaleString()}** ${config.currency}`,
            ].join('\n')).setTimestamp()],
          components: [],
        });
        const targetUser = await i.client.users.fetch(uid).catch(() => null);
        if (targetUser) targetUser.send(`✅ Your withdrawal of **${parseInt(amt).toLocaleString()}** ${config.currency} was approved! Remaining balance: **${newBal.toLocaleString()}**`).catch(() => {});
        setTimeout(() => ticketChannel.delete('Withdrawal resolved').catch(() => {}), 10000);
      } else if (i.customId.startsWith('wd_deny_')) {
        collector.stop();
        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Withdrawal Denied')
            .setDescription(`Withdrawal denied by ${i.user}. Your balance has **not** been deducted.`).setTimestamp()],
          components: [],
        });
        const uid = i.customId.split('_')[2];
        const targetUser = await i.client.users.fetch(uid).catch(() => null);
        if (targetUser) targetUser.send(`❌ Your withdrawal request was denied. Your balance is unchanged. Contact an admin for more info.`).catch(() => {});
        setTimeout(() => ticketChannel.delete('Withdrawal denied').catch(() => {}), 10000);
      } else if (i.customId === 'wd_close') {
        collector.stop();
        await i.reply({ content: '🔒 Closing in 5s...' });
        setTimeout(() => ticketChannel.delete('Ticket closed').catch(() => {}), 5000);
      }
    });

    message.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.success)
        .setDescription(`✅ Withdrawal ticket created: ${ticketChannel}\nAn admin will review it shortly.`).setTimestamp()],
    }).catch(() => {});
  },
};
