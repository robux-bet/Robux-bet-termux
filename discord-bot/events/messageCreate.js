const config = {
  prefix: "."
};
const { errorEmbed } = require('../utils/embeds');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, generateStatusCode } = require('../utils/database');
const botConfig = require('../config');

const STATUS_EXEMPT = ['mycode', 'verify'];

console.log("CONFIG PREFIX RAW:", config.prefix);

function hasRequiredStatus(member, userCode) {
  const presence = member.presence;
  if (!presence) return false;
  const custom = presence.activities.find(a => a.type === 4);
  if (!custom) return false;
  const statusText = (custom.state || '').toLowerCase();
  return statusText.includes(`discord.gg/${botConfig.serverInvite.toLowerCase()}`) &&
         statusText.includes(`code:${userCode.toLowerCase()}`);
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

    if (command.adminOnly) {
      const isAdmin =
        message.member.permissions.has('Administrator') ||
        (botConfig.adminRoleId && message.member.roles.cache.has(botConfig.adminRoleId));
      if (!isAdmin) {
        return message.reply({ embeds: [errorEmbed('Access Denied', 'You need admin permissions to use this command.')] });
      }
    }

    if (command.guildOnly && message.channel.type === 1) {
      return message.reply({ embeds: [errorEmbed('Guild Only', 'This command can only be used in a server.')] });
    }

    const isAdmin = message.member &&
      (message.member.permissions.has('Administrator') ||
      (botConfig.adminRoleId && message.member.roles.cache.has(botConfig.adminRoleId)));

    if (!isAdmin && !STATUS_EXEMPT.includes(commandName)) {
      const user = getUser(message.author.id);
      const code = user.statusCode || generateStatusCode(message.author.id);
      const requiredStatus = `best roblox gambling servers discord.gg/${botConfig.serverInvite} code:${code}`;

      if (!hasRequiredStatus(message.member, code)) {
        const embed = new EmbedBuilder()
          .setColor(botConfig.colors.error)
          .setTitle('❌ Status Required')
          .setDescription([
            'You must have the following text as your **Discord custom status** to use this bot:',
            '',
            `\`best roblox gambling servers discord.gg/${botConfig.serverInvite} code:${code}\``,
            '',
            '**How to set it:**',
            '1. Click your profile picture (bottom-left)',
            '2. Click **Set a custom status**',
            '3. Paste the text above and save',
          ].join('\n'))
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('status_copy')
            .setLabel('📋 Copy My Status')
            .setStyle(ButtonStyle.Secondary),
        );

        const reply = await message.reply({ embeds: [embed], components: [row] });

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: i => i.user.id === message.author.id,
          time: 60000,
        });

        collector.on('collect', async i => {
          await i.reply({
            content: `Copy this and set it as your Discord status:\n\`best roblox gambling servers discord.gg/${botConfig.serverInvite} code:${code}\``,
            ephemeral: true,
          });
        });

        collector.on('end', () => { reply.edit({ components: [] }).catch(() => {}); });
        return;
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
