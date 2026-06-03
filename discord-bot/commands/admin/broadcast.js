const { EmbedBuilder } = require('discord.js');
const { getAllUsers } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'broadcast',
  description: 'DM all users in the database an announcement',
  usage: '.broadcast <message>',
  adminOnly: true,
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply({ embeds: [errorEmbed('Missing Message', 'Provide a message to broadcast.\n`.broadcast <message>`')] });

    const users = getAllUsers();
    const ids = Object.keys(users);

    const statusMsg = await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('📡 Broadcasting...')
        .setDescription(`Sending to **${ids.length}** users...`)
        .setTimestamp()],
    });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📢 Announcement')
      .setDescription(text)
      .setFooter({ text: `From: ${message.author.tag}` })
      .setTimestamp();

    let sent = 0, failed = 0;
    for (const userId of ids) {
      try {
        const user = await message.client.users.fetch(userId).catch(() => null);
        if (user && !user.bot) { await user.send({ embeds: [embed] }); sent++; }
        else failed++;
      } catch { failed++; }
      await new Promise(r => setTimeout(r, 400));
    }

    statusMsg.edit({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Broadcast Complete')
        .addFields(
          { name: '✅ Delivered', value: `${sent}`, inline: true },
          { name: '❌ Failed / DMs closed', value: `${failed}`, inline: true },
        )
        .setTimestamp()],
    });
  },
};
