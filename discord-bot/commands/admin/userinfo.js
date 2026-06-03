const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'userinfo',
  description: 'View detailed info about a user',
  usage: '.userinfo @user',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!target) return message.reply({ embeds: [errorEmbed('No User', 'Mention a user or provide their ID.\n`.userinfo @user`')] });

    const u = getUser(target.id);

    const honeyStatus = u.depositHoneymoon
      ? `✅ Active — ${u.honeyBetsPlaced || 0}/5 bets used (deposit: ${(u.depositAmount || 0).toLocaleString()})`
      : '❌ Inactive';

    const overrideStatus = u.forceNextOutcome
      ? `\`${u.forceNextOutcome}\` (set via .ayowtf)`
      : 'None';

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`📋 User Info — ${target.tag}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '💰 Actual Balance', value: `${(u.balance || 0).toLocaleString()} ${config.currency}`, inline: true },
        { name: '🎮 Demo Balance', value: `${(u.demoBalance || 0).toLocaleString()} ${config.currency}`, inline: true },
        { name: '🏦 Vault', value: `${(u.vault || 0).toLocaleString()} ${config.currency}`, inline: true },
        { name: '📊 Wager Required', value: `${(u.wagerRequired || 0).toLocaleString()} ${config.currency}`, inline: true },
        { name: '🎲 Games Played', value: `${u.gamesPlayed || 0} total`, inline: true },
        { name: '🔒 Locked', value: u.locked ? '**Yes** — cannot gamble' : 'No', inline: true },
        { name: '🍯 Deposit Honeymoon', value: honeyStatus, inline: false },
        { name: '🎯 Next Game Override', value: overrideStatus, inline: true },
        { name: '🏆 Total Won', value: `${(u.totalWon || 0).toLocaleString()} ${config.currency}`, inline: true },
        { name: '💸 Total Lost', value: `${(u.totalLost || 0).toLocaleString()} ${config.currency}`, inline: true },
        { name: '🆔 User ID', value: `\`${target.id}\``, inline: false },
      )
      .setFooter({ text: `Status Code: ${u.statusCode || 'N/A'}` })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
