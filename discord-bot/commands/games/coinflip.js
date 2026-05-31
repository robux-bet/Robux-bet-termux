const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, tiePayout, rigged50Win, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

module.exports = {
  name: 'cf',
  aliases: ['coinflip'],
  description: 'Flip a coin — heads or tails',
  usage: '.cf <bet|all|half> [h|t]',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    let choice = args[1]?.toLowerCase();

    if (!choice || !['h', 't', 'heads', 'tails'].includes(choice)) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cf_heads').setLabel('🪙 Heads').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cf_tails').setLabel('🟡 Tails').setStyle(ButtonStyle.Secondary),
      );
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`🪙 Coinflip${balLabel(isDemo)}`)
        .setDescription(`Bet: **${bet.toLocaleString()}** ${config.currency}\nChoose **Heads** or **Tails**!`)
        .setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row] });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30000, max: 1,
      });
      collector.on('collect', async i => {
        choice = i.customId === 'cf_heads' ? 'h' : 't';
        await i.deferUpdate();
        await runFlip(message, reply, bet, choice, isDemo);
      });
      collector.on('end', (_, r) => { if (r === 'time') reply.edit({ components: [] }).catch(() => {}); });
      return;
    }

    choice = choice[0];
    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(`🪙 Coinflip${balLabel(isDemo)}`).setTimestamp()] });
    await runFlip(message, reply, bet, choice, isDemo);
  },
};

async function runFlip(message, reply, bet, choice, isDemo) {
  const ANIM = ['🌀', '🪙', '💫', '🪙', '🌀'];
  const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle(`🪙 Coinflip${balLabel(isDemo)}`).setTimestamp();
  for (const frame of ANIM) {
    embed.setDescription(`${frame} **Flipping...**`);
    await reply.edit({ embeds: [embed], components: [] }).catch(() => {});
    await new Promise(r => setTimeout(r, 350));
  }

  // Rigged: demo=70% win, actual=30% win
  const won = rigged50Win(isDemo);
  const result = won ? choice : (choice === 'h' ? 't' : 'h');
  const resultLabel = result === 'h' ? '🪙 Heads' : '🟡 Tails';
  const choiceLabel = choice === 'h' ? '🪙 Heads' : '🟡 Tails';

  spendBet(message.author.id, bet, isDemo);
  if (won) {
    const payout = calcPayout(bet, 2);
    addWin(message.author.id, payout, isDemo);
    recordGame(message.author.id, true, payout - bet);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
    embed.setColor(config.colors.success).setDescription([
      `It's **${resultLabel}**! Your pick: **${choiceLabel}**`,
      `🎉 Won **${payout.toLocaleString()}** ${config.currency}!`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n'));
  } else {
    recordGame(message.author.id, false, bet);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
    embed.setColor(config.colors.error).setDescription([
      `It's **${resultLabel}**! Your pick: **${choiceLabel}**`,
      `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n'));
  }
  reply.edit({ embeds: [embed] }).catch(() => {});
}
