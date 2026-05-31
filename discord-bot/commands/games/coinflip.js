const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'cf',
  aliases: ['coinflip'],
  description: 'Flip a coin — heads or tails',
  usage: '.cf <bet> [h|t]',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .cf <bet> [h|t]`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    let choice = args[1]?.toLowerCase();

    // If no choice, show buttons
    if (!choice || !['h', 't', 'heads', 'tails'].includes(choice)) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cf_heads').setLabel('🪙 Heads').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cf_tails').setLabel('🟡 Tails').setStyle(ButtonStyle.Secondary),
      );
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🪙 Coinflip')
        .setDescription(`Bet: **${bet.toLocaleString()}** ${config.currency}\nChoose **Heads** or **Tails**!`)
        .setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row] });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30000,
        max: 1,
      });

      collector.on('collect', async i => {
        choice = i.customId === 'cf_heads' ? 'h' : 't';
        await i.deferUpdate();
        await runFlip(message, reply, bet, choice);
      });

      collector.on('end', (_, reason) => {
        if (reason === 'time') reply.edit({ components: [] }).catch(() => {});
      });
      return;
    }

    choice = choice[0];
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('🪙 Coinflip').setTimestamp();
    const reply = await message.reply({ embeds: [embed] });
    await runFlip(message, reply, bet, choice);
  },
};

async function runFlip(message, reply, bet, choice) {
  const ANIM = ['🌀', '🪙', '💫', '🪙', '🌀'];
  const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('🪙 Coinflip').setTimestamp();

  for (const frame of ANIM) {
    embed.setDescription(`${frame} **Flipping...**`);
    await reply.edit({ embeds: [embed], components: [] }).catch(() => {});
    await new Promise(r => setTimeout(r, 400));
  }

  const result = Math.random() < 0.5 ? 'h' : 't';
  const won = choice === result;
  const resultLabel = result === 'h' ? '🪙 Heads' : '🟡 Tails';
  const choiceLabel = choice === 'h' ? '🪙 Heads' : '🟡 Tails';

  if (won) addBalance(message.author.id, bet);
  else removeBalance(message.author.id, bet);

  recordGame(message.author.id, won, bet);
  const newBal = getUser(message.author.id).balance;

  embed
    .setColor(won ? config.colors.success : config.colors.error)
    .setDescription([
      `It's **${resultLabel}**!`,
      `Your pick: **${choiceLabel}**`,
      '',
      won ? `🎉 You won **${bet.toLocaleString()}** ${config.currency}!` : `😢 You lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
    ].join('\n'));

  reply.edit({ embeds: [embed] }).catch(() => {});
}
