const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  name: 'stats',
  aliases: ['profile', 'stat'],
  description: 'View your gambling stats',
  usage: '.stats [@user]',
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const user = getUser(target.id);

    const gamesPlayed = user.gamesPlayed || 0;
    const totalWon = user.totalWon || 0;
    const totalLost = user.totalLost || 0;
    const net = totalWon - totalLost;
    const winRate = gamesPlayed > 0
      ? ((user.wins || 0) / gamesPlayed * 100).toFixed(1)
      : '0.0';

    const lastDaily = user.lastDaily
      ? `<t:${Math.floor(user.lastDaily / 1000)}:R>`
      : 'Never';

    const lastWagered = user.lastWagered
      ? `<t:${Math.floor(user.lastWagered / 1000)}:R>`
      : 'Never';

    const embed = new EmbedBuilder()
      .setColor(net >= 0 ? config.colors.success : config.colors.error)
      .setTitle(`📊 ${target.username}'s Stats`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Balance', value: `**${(user.balance || 0).toLocaleString()}** ${config.currency}`, inline: true },
        { name: '🏦 Vault', value: `**${(user.vault || 0).toLocaleString()}** ${config.currency}`, inline: true },
        { name: '💎 Demo Balance', value: `**${(user.demoBalance || 0).toLocaleString()}** ${config.currency}`, inline: true },
        { name: '🎮 Games Played', value: `**${gamesPlayed.toLocaleString()}**`, inline: true },
        { name: '🏆 Total Won', value: `**${totalWon.toLocaleString()}** ${config.currency}`, inline: true },
        { name: '💸 Total Lost', value: `**${totalLost.toLocaleString()}** ${config.currency}`, inline: true },
        { name: `${net >= 0 ? '📈' : '📉'} Net Profit`, value: `**${net >= 0 ? '+' : ''}${net.toLocaleString()}** ${config.currency}`, inline: true },
        { name: '🎯 Win Rate', value: `**${winRate}%**`, inline: true },
        { name: '🎡 Last Daily', value: lastDaily, inline: true },
        { name: '🎲 Last Wager', value: lastWagered, inline: true },
      )
      .setFooter({ text: 'discord.gg/n7wWqamv6b' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
