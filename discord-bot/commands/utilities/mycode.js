const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/database');
const config = require('../../config');

module.exports = {
  name: 'mycode',
  description: 'Shows the unique status text you must set to use this bot',
  usage: '.mycode',
  async execute(message) {
    const user = getUser(message.author.id);
    const code = user.statusCode;
    const requiredText = `best roblox gambling servers discord.gg/${code}`;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📋 Your Required Status')
      .setDescription([
        'Set the following text as your **Discord custom status** to use the bot:',
        '',
        `\`\`\`${requiredText}\`\`\``,
        '',
        '**How to set it:**',
        '1. Click your profile picture (bottom-left in Discord)',
        '2. Click **Set a custom status**',
        '3. Paste the text above and save',
        '',
        '> Your code is unique to you — do not share it.',
      ].join('\n'))
      .setFooter({ text: `Your code: ${code}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
