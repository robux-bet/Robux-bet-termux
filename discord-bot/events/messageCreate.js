const config = require('../config');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    let command = client.commands.get(commandName);
    if (!command) {
      const alias = client.aliases.get(commandName);
      if (alias) command = client.commands.get(alias);
    }
    if (!command) return;

    // Admin check
    if (command.adminOnly) {
      const isAdmin =
        message.member.permissions.has('Administrator') ||
        (config.adminRoleId && message.member.roles.cache.has(config.adminRoleId));
      if (!isAdmin) {
        return message.reply({ embeds: [errorEmbed('Access Denied', 'You need admin permissions to use this command.')] });
      }
    }

    // Guild only
    if (command.guildOnly && message.channel.type === 1) {
      return message.reply({ embeds: [errorEmbed('Guild Only', 'This command can only be used in a server.')] });
    }

    try {
      await command.execute(message, args, client);
    } catch (err) {
      console.error(`Error in ${commandName}:`, err);
      message.reply({ embeds: [errorEmbed('Error', 'Something went wrong. Please try again.')] }).catch(() => {});
    }
  },
};
