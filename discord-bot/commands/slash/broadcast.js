const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Send an announcement to a channel (admin only)')
    .addStringOption(o => o.setName('message').setDescription('Announcement message').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send to (defaults to current channel)').setRequired(false)),

  async execute(interaction, client) {
    const text    = interaction.options.getString('message');
    const target  = interaction.options.getChannel('channel') || interaction.channel;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📢 Casino Announcement')
      .setDescription(text)
      .setFooter({ text: `discord.gg/${config.serverInvite}` })
      .setTimestamp();

    try {
      await target.send({ embeds: [embed] });
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ Broadcast Sent')
          .setDescription(`Announcement posted in ${target}`)
          .setTimestamp()],
        ephemeral: true,
      });
    } catch (err) {
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Failed')
          .setDescription(`Could not send to ${target}.\nMake sure the bot has permission to post there.`)
          .setTimestamp()],
        ephemeral: true,
      });
    }
  },
};
