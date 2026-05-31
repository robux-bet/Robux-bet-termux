const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
  name: 'ping',
  description: 'Shows bot latency and uptime',
  usage: '.ping',
  async execute(message, args, client) {
    const sent = await message.reply({ content: '🏓 Pinging...' });
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const getStatus = ms => ms < 100 ? '🟢 Excellent' : ms < 200 ? '🟡 Good' : '🔴 Slow';

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '📡 Message Latency', value: `**${latency}ms** ${getStatus(latency)}`, inline: true },
        { name: '🌐 API Latency', value: `**${apiLatency}ms** ${getStatus(apiLatency)}`, inline: true },
        { name: '⏱️ Uptime', value: `**${uptimeStr}**`, inline: false },
      )
      .setTimestamp();

    sent.edit({ content: null, embeds: [embed] });
  },
};
