const { EmbedBuilder } = require('discord.js');
const { getUser, claimDemo } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'demo',
  description: 'Claim 1,000 free demo Robux (one-time only)',
  usage: '.demo',
  guildOnly: true,
  async execute(message) {
    const claimed = claimDemo(message.author.id);

    if (!claimed) {
      const user = getUser(message.author.id);
      return message.reply({
        embeds: [
          errorEmbed('Already Claimed', [
            `You've already claimed your demo balance!`,
            ``,
            `💎 **Demo Balance:** ${(user.demoBalance || 0).toLocaleString()} Robux`,
            `💰 **Actual Balance:** ${user.balance.toLocaleString()} Robux`,
            ``,
            `To get actual Robux, open a deposit ticket with \`.deposit <amount>\``,
          ].join('\n')),
        ],
      });
    }

    // Animate the claim
    const frames = ['🎁', '✨', '💫', '⭐', '💎'];
    const embed = new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle('🎁 Claiming Demo Balance...')
      .setDescription('✨ Opening your welcome package...')
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });

    for (const frame of frames) {
      await new Promise(r => setTimeout(r, 400));
      embed.setDescription(`${frame} Opening...`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 500));

    embed
      .setColor(config.colors.success)
      .setTitle('🎉 Demo Balance Claimed!')
      .setDescription([
        `Welcome to the casino, ${message.author}!`,
        ``,
        `💎 You received **1,000 Demo Robux** to try all games!`,
        ``,
        `**Demo Mode Rules:**`,
        `• Max bet per game: **100 Robux**`,
        `• Demo balance can't be withdrawn`,
        `• To play with real stakes, use \`.deposit\``,
        ``,
        `Run \`.guide\` to see how to get started!`,
      ].join('\n'))
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: 'This is a one-time claim.' });

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
