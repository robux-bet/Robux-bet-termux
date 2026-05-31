const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'balance',
  aliases: ['bal'],
  description: 'Check your or another user\'s balance',
  usage: '.balance [@user]',
  guildOnly: true,
  async execute(message) {
    const target = message.mentions.users.first() || message.author;
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (!member) return message.reply({ embeds: [errorEmbed('Not Found', 'Could not find that user.')] });

    const user = getUser(target.id);
    const inv = user.inventory || {};
    const itemCount = Object.values(inv).reduce((s, n) => s + n, 0);

    // Check VIP/cosmetic items for display
    const hasVip = inv['vip_badge'] > 0;
    const hasCrown = inv['diamond_crown'] > 0;
    const hasTrophy = inv['neon_trophy'] > 0;

    const nameDisplay = [
      hasCrown ? '👑' : '',
      hasVip ? '⭐' : '',
      hasTrophy ? '🏆' : '',
      member.displayName,
    ].filter(Boolean).join(' ');

    const usingDemo = user.balance === 0 && user.demoBalance > 0;

    const embed = new EmbedBuilder()
      .setColor(hasCrown ? config.colors.gold : hasVip ? 0x9B59B6 : config.colors.primary)
      .setTitle(`${config.currencyEmoji} ${nameDisplay}'s Balance`)
      .addFields(
        { name: '💰 Actual Balance', value: `**${user.balance.toLocaleString()}** ${config.currency}`, inline: true },
        { name: '💎 Demo Balance', value: `**${(user.demoBalance || 0).toLocaleString()}** ${config.currency}`, inline: true },
        { name: '🏦 Vault', value: `**${(user.vault || 0).toLocaleString()}** ${config.currency}`, inline: true },
      )
      .setDescription(usingDemo
        ? `> ⚡ Currently using **Demo** balance. Deposit to get actual ${config.currency}!`
        : user.balance > 0
        ? `> 💸 Active balance: **Actual** ${config.currency}`
        : `> ❌ No balance. Use \`.demo\` to claim 1,000 demo ${config.currency}!`)
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: itemCount > 0 ? `🎒 ${itemCount} item(s) in collection` : 'No items — check .market' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
