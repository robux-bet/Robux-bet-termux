const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const { fmtR } = require('../../utils/gameUtils');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Full user profile and stats (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const u = getUser(target.id);

    const gamesPlayed = u.gamesPlayed || 0;
    const totalWon    = u.totalWon    || 0;
    const totalLost   = u.totalLost   || 0;
    const net         = totalWon - totalLost;
    const winRate     = gamesPlayed > 0 ? (((u.wins || 0) / gamesPlayed) * 100).toFixed(1) : '0.0';
    const lastDaily   = u.lastDaily   ? `<t:${Math.floor(u.lastDaily / 1000)}:R>` : 'Never';
    const lastWagered = u.lastWagered ? `<t:${Math.floor(u.lastWagered / 1000)}:R>` : 'Never';

    const embed = new EmbedBuilder()
      .setColor(u.locked ? config.colors.error : config.colors.primary)
      .setTitle(`🔍 User Info — ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🆔 User ID',        value: `\`${target.id}\``,                                      inline: true },
        { name: '🔒 Status',         value: u.locked ? '🔴 **LOCKED**' : '🟢 Active',               inline: true },
        { name: '🔑 Status Code',    value: `\`${u.statusCode || 'N/A'}\``,                          inline: true },

        { name: '💰 Balance',        value: `**${fmtR(u.balance || 0)}** ${config.currency}`,        inline: true },
        { name: '🏦 Vault',          value: `**${fmtR(u.vault || 0)}** ${config.currency}`,          inline: true },
        { name: '💎 Demo Balance',   value: `**${fmtR(u.demoBalance || 0)}** ${config.currency}`,    inline: true },

        { name: '📥 Total Deposited',value: `**${fmtR(u.totalDeposited || 0)}** ${config.currency}`, inline: true },
        { name: '📤 Total Withdrawn',value: `**${fmtR(u.totalWithdrawn || 0)}** ${config.currency}`, inline: true },
        { name: `${net >= 0 ? '📈' : '📉'} Net P&L`, value: `**${net >= 0 ? '+' : ''}${fmtR(net)}** ${config.currency}`, inline: true },

        { name: '🎮 Games Played',   value: `**${gamesPlayed}** (Real: ${u.realGamesPlayed || 0} · Demo: ${u.demoGamesPlayed || 0})`, inline: false },
        { name: '🏆 Total Won',      value: `**${fmtR(totalWon)}** ${config.currency}`,              inline: true },
        { name: '💸 Total Lost',     value: `**${fmtR(totalLost)}** ${config.currency}`,             inline: true },
        { name: '🎯 Win Rate',       value: `**${winRate}%**`,                                        inline: true },

        { name: '🍯 Honeymoon',      value: u.depositHoneymoon ? `Active · ${u.honeyBetsPlaced || 0}/5 bets · Deposit: **${fmtR(u.depositAmount || 0)}**` : 'Inactive', inline: false },
        { name: '🎡 Last Daily',     value: lastDaily,                                                inline: true },
        { name: '🎲 Last Wager',     value: lastWagered,                                              inline: true },
        { name: '📋 Wager Required', value: `**${fmtR(u.wagerRequired || 0)}** ${config.currency}`,  inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
