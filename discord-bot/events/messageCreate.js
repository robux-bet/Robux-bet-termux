const config = {
  prefix: "."
};
const { errorEmbed } = require('../utils/embeds');
const { EmbedBuilder } = require('discord.js');
const { getUser, generateStatusCode } = require('../utils/database');
const botConfig = require('../config');

// Commands that don't require the status check
const STATUS_EXEMPT = ['mycode'];

console.log("CONFIG PREFIX RAW:", config.prefix);

function hasRequiredStatus(member, requiredCode) {
  const presence = member.presence;
  if (!presence) return false;
  const custom = presence.activities.find(a => a.type === 4);
  if (!custom) return false;
  const statusText = (custom.state || '').toLowerCase();
  return statusText.includes(`best roblox gambling servers discord.gg/${requiredCode.toLowerCase()}`);
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    console.log("PREFIX:", config.prefix);
    console.log("MESSAGE RECEIVED:", message.content);

    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    console.log("COMMAND:", commandName);

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
        (botConfig.adminRoleId && message.member.roles.cache.has(botConfig.adminRoleId));
      if (!isAdmin) {
        return message.reply({ embeds: [errorEmbed('Access Denied', 'You need admin permissions to use this command.')] });
      }
    }

    // Guild only
    if (command.guildOnly && message.channel.type === 1) {
      return message.reply({ embeds: [errorEmbed('Guild Only', 'This command can only be used in a server.')] });
    }

    // Status check — skip for exempt commands and admins
    const isAdmin = message.member &&
      (message.member.permissions.has('Administrator') ||
      (botConfig.adminRoleId && message.member.roles.cache.has(botConfig.adminRoleId)));

    if (!isAdmin && !STATUS_EXEMPT.includes(commandName)) {
      const user = getUser(message.author.id);
      const code = user.statusCode || generateStatusCode(message.author.id);
      if (!hasRequiredStatus(message.member, code)) {
        const embed = new EmbedBuilder()
          .setColor(botConfig.colors.error)
          .setTitle('❌ Status Required')
          .setDescription([
            'You must have the following text in your **Discord custom status** to use this bot:',
            '',
            `\`\`\`best roblox gambling servers discord.gg/${code}\`\`\``,
            '',
            '**How to set your status:**',
            '1. Click your profile picture (bottom-left)',
            '2. Click **Set a custom status**',
            '3. Paste the text above and save',
            '',
            `Use \`.mycode\` to see your unique code again anytime.`,
          ].join('\n'))
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }
    }

    try {
      await command.execute(message, args, client);
    } catch (err) {
      console.error(`Error in ${commandName}:`, err);
      message.reply({ embeds: [errorEmbed('Error', 'Something went wrong. Please try again.')] }).catch(() => {});
    }
  },
};
