const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'resetwager',
  description: 'Clear a user\'s wager requirement',
  usage: '.resetwager @user',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!target) return message.reply({ embeds: [errorEmbed('No User', 'Mention a user or provide their ID.\n`.resetwager @user`')] });

    const u = getUser(target.id);
    const old = u.wagerRequired || 0;
    u.wagerRequired = 0;
    saveUser(target.id, u);

    message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Wager Reset')
        .setDescription(`Cleared **${old.toLocaleString()}** ${config.currency} wager requirement for ${target}.`)
        .setTimestamp()],
    });
  },
};
