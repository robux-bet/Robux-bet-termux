const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'lockuser',
  description: 'Lock a user from gambling',
  usage: '.lockuser @user',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!target) return message.reply({ embeds: [errorEmbed('No User', 'Mention a user or provide their ID.\n`.lockuser @user`')] });

    const u = getUser(target.id);
    if (u.locked) return message.reply({ embeds: [errorEmbed('Already Locked', `${target.tag} is already locked.`)] });

    u.locked = true;
    saveUser(target.id, u);

    message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('🔒 User Locked')
        .setDescription(`${target} has been **locked** from gambling.\nUse \`.unlockuser\` to reverse this.`)
        .setTimestamp()],
    });
  },
};
