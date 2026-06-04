const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const { fmtR } = require('../../utils/gameUtils');
const config = require('../../config');

module.exports = {
  name: 'stats',
  aliases: ['profile', 'stat'],
  description: 'View your gambling stats',
  usage: '.stats [@user]',
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const user = getUser(target.id);

    const gamesPlayed  = user.gamesPlayed   || 0;
    const totalWon     = user.totalWon      || 0;
    const totalLost    = user.totalLost     || 0;
    const totalDep     = user.totalDeposited || 0;
    const totalWith    = user.totalWithdrawn || 0;
    const net          = totalWon - totalLost;
    const winRate      = gamesPlayed > 0
      ? (((user.wins || 0) / gamesPlayed) * 100).toFixed(1)
      : '0.0';

    const lastDaily   = user.lastDaily   ? `<t:${Math.floor(user.lastDaily / 1000)}:R>`   : 'Never';
    const lastWagered = user.lastWagered ? `<t:${Math.floor(user.lastWagered / 1000)}:R>` : 'Never';

    const embed = new EmbedBuilder()
      .setColor(net >= 0 ? config.colors.success : config.colors.error)
      .setTitle(`📊 ${target.username}'s Stats`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Balance',       value: `**${fmtR(user.balance || 0)}** ${config.currency}`,   inline: true },
        { name: '🏦 Vault',         value: `**${fmtR(user.vault || 0)}** ${config.currency}`,     inline: true },
        { name: '💎 Demo Balance',  value: `**${fmtR(user.demoBalance || 0)}** ${config.currency}`, inline: true },

        { name: '📥 Total Deposited',  value: `**${fmtR(totalDep)}** ${config.currency}`,  inline: true },
        { name: '📤 Total Withdrawn',  value: `**${fmtR(totalWith)}** ${config.currency}`, inline: true },
        { name: '💹 Depo vs Withdraw', value: `**${totalDep >= totalWith ? '+' : ''}${fmtR(totalDep - totalWith)}** ${config.currency}`, inline: true },

        { name: '🎮 Games Played',  value: `**${gamesPlayed.toLocaleString()}**`,                inline: true },
        { name: '🏆 Total Won',     value: `**${fmtR(totalWon)}** ${config.currency}`,            inline: true },
        { name: '💸 Total Lost',    value: `**${fmtR(totalLost)}** ${config.currency}`,           inline: true },

        { name: `${net >= 0 ? '📈' : '📉'} Net P&L`, value: `**${net >= 0 ? '+' : ''}${fmtR(net)}** ${config.currency}`, inline: true },
        { name: '🎯 Win Rate',      value: `**${winRate}%**`,                                    inline: true },
        { name: '🎡 Last Daily',    value: lastDaily,                                             inline: true },
        { name: '🎲 Last Wager',    value: lastWagered,                                           inline: true },
      )
      .setFooter({ text: 'discord.gg/n7wWqamv6b' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
