const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
  name: 'cleargames',
  description: 'Force-clear all stuck active games',
  usage: '.cleargames',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args, client) {
    const count = client.activeGames.size;
    client.activeGames.clear();
    message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🧹 Games Cleared')
        .setDescription(count > 0
          ? `Cleared **${count}** active game(s) from the tracker.`
          : 'No active games were running.')
        .setTimestamp()],
    });
  },
};
