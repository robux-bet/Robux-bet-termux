const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'room',
  description: 'Create a private thread where you can add/remove anyone',
  usage: '.room [create|add|remove|close] [...args]',
  guildOnly: true,
  async execute(message, args) {
    const sub = args[0]?.toLowerCase() || 'create';

    if (sub === 'create') {
      const name = args.slice(1).join(' ') || `${message.author.username}'s Room`;

      let thread;
      try {
        thread = await message.channel.threads.create({
          name: name.slice(0, 100),
          type: ChannelType.PrivateThread,
          reason: `Private room created by ${message.author.tag}`,
          invitable: false,
        });
      } catch {
        // Fallback to public thread if private not available
        thread = await message.channel.threads.create({
          name: name.slice(0, 100),
          type: ChannelType.PublicThread,
          reason: `Room created by ${message.author.tag}`,
        });
      }

      await thread.members.add(message.author.id);

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🚪 Room Created')
        .setDescription([
          `Your private room **${name}** has been created!`,
          '',
          `📌 Thread: ${thread}`,
          '',
          '**Commands:**',
          '`.room add @user` — Add someone',
          '`.room remove @user` — Remove someone',
          '`.room close` — Close the room',
        ].join('\n'))
        .setTimestamp();

      message.reply({ embeds: [embed] });

      thread.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🚪 Private Room')
            .setDescription(`Welcome, ${message.author}! This is your private room.\nUse \`.room add @user\` or \`.room remove @user\` to manage members.`)
            .setTimestamp(),
        ],
      });

    } else if (sub === 'add') {
      if (!message.channel.isThread()) return message.reply({ embeds: [errorEmbed('Not a Thread', 'This command can only be used inside a room thread.')] });
      const target = message.mentions.users.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Mention a user to add: `.room add @user`')] });
      await message.channel.members.add(target.id);
      message.reply({ embeds: [successEmbed('Member Added', `${target} has been added to the room.`)] });

    } else if (sub === 'remove') {
      if (!message.channel.isThread()) return message.reply({ embeds: [errorEmbed('Not a Thread', 'This command can only be used inside a room thread.')] });
      const target = message.mentions.users.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Mention a user to remove: `.room remove @user`')] });
      await message.channel.members.remove(target.id);
      message.reply({ embeds: [successEmbed('Member Removed', `${target} has been removed from the room.`)] });

    } else if (sub === 'close') {
      if (!message.channel.isThread()) return message.reply({ embeds: [errorEmbed('Not a Thread', 'This command can only be used inside a room thread.')] });
      await message.reply({ embeds: [successEmbed('Room Closing', 'This room will be archived in 5 seconds...')] });
      setTimeout(() => message.channel.setArchived(true).catch(() => {}), 5000);

    } else {
      message.reply({ embeds: [errorEmbed('Invalid Subcommand', 'Use: `create`, `add @user`, `remove @user`, `close`')] });
    }
  },
};
