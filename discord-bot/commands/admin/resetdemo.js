const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'resetdemo',
  description: 'Reset a user\'s demo claim so they can use .demo again',
  usage: '.resetdemo @user',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!target) return message.reply({ embeds: [errorEmbed('No User', 'Mention a user or provide their ID.\n`.resetdemo @user`')] });

    const u = getUser(target.id);
    u.hasClaimedDemo = false;
    u.demoBalance = 0;
    u.demoGamesPlayed = 0;
    saveUser(target.id, u);

    message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Demo Reset')
        .setDescription(`${target}'s demo claim has been reset. They can now use \`.demo\` again.`)
        .setTimestamp()],
    });
  },
};
