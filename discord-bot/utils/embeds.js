const { EmbedBuilder } = require('discord.js');
const config = require('../config');

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.error)
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function goldEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.gold)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function warningEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function balanceEmbed(user, member) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${config.currencyEmoji} ${member.displayName}'s Balance`)
    .addFields(
      { name: '💰 Wallet', value: `**${user.balance.toLocaleString()}** ${config.currency}`, inline: true },
      { name: '🏦 Vault', value: `**${user.vault.toLocaleString()}** ${config.currency}`, inline: true },
      { name: '📊 Total', value: `**${(user.balance + user.vault).toLocaleString()}** ${config.currency}`, inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
}

module.exports = { successEmbed, errorEmbed, infoEmbed, goldEmbed, warningEmbed, balanceEmbed };
