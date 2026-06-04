const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
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
        .setDescription(`Bet: **${fmtR(bet)}** ${config.currency}\nChoose **Heads** or **Tails**!`)
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

async function runFlip(message, existingMsg, bet, choice, isDemo) {
  const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
  const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Coinflip', existingMsg);

  const game = beginGame(message.author.id, 1);
  spendBet(message.author.id, bet, isDemo);

  let won = game.floats[0] >= 0.5;
  if (isForceWin(mode)) won = true;
  else if (mode === 'lose') won = false;

  const result = won ? choice : (choice === 'h' ? 't' : 'h');
  const resultLabel = result === 'h' ? '🪙 Heads' : '🟡 Tails';
  const choiceLabel = choice === 'h' ? '🪙 Heads' : '🟡 Tails';

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`🪙 Coinflip${balLabel(isDemo)}`)
    .setTimestamp();

  if (won) {
    const payout = calcPayout(bet, 2);
    addWin(message.author.id, payout, isDemo);
    recordGame(message.author.id, true, payout - bet);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
    embed.setColor(config.colors.success).setDescription([
      `It's **${resultLabel}**! Your pick: **${choiceLabel}**`,
      `🎉 Won **${fmtR(payout)}** ${config.currency}!`,
      `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n')).setFooter({ text: gameIdFooter(game.gameId) });
  } else {
    recordGame(message.author.id, false, bet);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
    embed.setColor(config.colors.error).setDescription([
      `It's **${resultLabel}**! Your pick: **${choiceLabel}**`,
      `😢 Lost **${fmtR(bet)}** ${config.currency}.`,
      `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n')).setFooter({ text: gameIdFooter(game.gameId) });
  }

  saveGameRecord({
    gameId: game.gameId, type: 'coinflip', userId: message.author.id,
    serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
    clientSeed: game.clientSeed, nonce: game.nonce,
    inputs: { choice },
    outcome: { result: won ? 'win' : 'lose', resultSide: result },
  });

  recordRiggedGame(message.author.id, isDemo, mode);
  loadMsg.edit({ embeds: [embed] }).catch(() => {});
}
