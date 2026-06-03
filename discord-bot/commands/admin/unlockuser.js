const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'unlockuser',
  description: 'Unlock a user so they can gamble again',
  usage: '.unlockuser @user',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!target) return message.reply({ embeds: [errorEmbed('No User', 'Mention a user or provide their ID.\n`.unlockuser @user`')] });

    const u = getUser(target.id);
    if (!u.locked) return message.reply({ embeds: [errorEmbed('Not Locked', `${target.tag} is not locked.`)] });

    u.locked = false;
    saveUser(target.id, u);

    message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🔓 User Unlocked')
        .setDescription(`${target} can now gamble again.`)
        .setTimestamp()],
    });
  },
};
