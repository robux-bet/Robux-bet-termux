const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  name: 'mycode',
  description: 'Shows the unique status text you must set to use this bot',
  usage: '.mycode',
  async execute(message) {
    const user = getUser(message.author.id);
    const code = user.statusCode;
    const requiredText = `best roblox gambling servers discord.gg/${config.serverInvite} code:${code}`;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📋 Your Required Status')
      .setDescription([
        'Set the following text as your **Discord custom status** to use the bot:',
        '',
        `\`${requiredText}\``,
        '',
        '**How to set it:**',
        '1. Click your profile picture (bottom-left in Discord)',
        '2. Click **Set a custom status**',
        '3. Paste the text above and save',
        '',
        '> Your code is unique — do not share it with others.',
      ].join('\n'))
      .setFooter({ text: `Your code: ${code}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mycode_copy')
        .setLabel('📋 Copy Status Text')
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
        content: `Copy this and set it as your Discord status:\n\`${requiredText}\``,
        ephemeral: true,
      });
    });

    collector.on('end', () => { reply.edit({ components: [] }).catch(() => {}); });
  },
};
