const { getUser } = require('../../utils/database');
const { balanceEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  name: 'balance',
  aliases: ['bal'],
  description: 'Check your or another user\'s balance',
  usage: '.balance [@user]',
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (!member) return message.reply({ embeds: [errorEmbed('Not Found', 'Could not find that user in this server.')] });

    const user = getUser(target.id);
    message.reply({ embeds: [balanceEmbed(user, member)] });
  },
};
