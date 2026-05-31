const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, tiePayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function cardFromFloats(f0, f1) {
  return { r: RANKS[Math.floor(f0 * 13)], s: SUITS[Math.floor(f1 * 4)] };
}

function cardVal(r) {
  if (['10','J','Q','K'].includes(r)) return 0;
  if (r === 'A') return 1;
  return parseInt(r);
}

function handVal(hand) { return hand.reduce((s, c) => s + cardVal(c.r), 0) % 10; }
function handStr(hand) { return hand.map(c => `${c.r}${c.s}`).join(' '); }

module.exports = {
  name: 'baccarat',
  aliases: ['bac'],
  description: 'Baccarat — bet on Player, Banker, or Tie',
  usage: '.baccarat <bet|all|half> [p|b|t]',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    let betOn = ['p','b','t'].includes(args[1]) ? args[1] : null;

    if (!betOn) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bac_p').setLabel('👤 Player (2x)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bac_b').setLabel('🏦 Banker (2x)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bac_t').setLabel('🤝 Tie (8x)').setStyle(ButtonStyle.Success),
      );
      const embed = new EmbedBuilder().setColor(config.colors.primary)
        .setTitle(`🃏 Baccarat${balLabel(isDemo)}`).setDescription(`Bet: **${bet.toLocaleString()}** ${config.currency}\nChoose your bet:`).setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row] });
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button, filter: i => i.user.id === message.author.id, time: 30000, max: 1,
      });
      collector.on('collect', async i => {
        betOn = i.customId.replace('bac_', '');
        await i.deferUpdate();
        await runBaccarat(message, reply, bet, betOn, isDemo);
      });
      collector.on('end', (_, r) => { if (r === 'time') reply.edit({ components: [] }).catch(() => {}); });
      return;
    }

    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(`🃏 Baccarat${balLabel(isDemo)}`).setTimestamp()] });
    await runBaccarat(message, reply, bet, betOn, isDemo);
  },
};

async function runBaccarat(message, reply, bet, betOn, isDemo) {
  const game = beginGame(message.author.id, 12);
  spendBet(message.author.id, bet, isDemo);

  let fi = 0;
  const nextCard = () => cardFromFloats(game.floats[fi++], game.floats[fi++]);

  const player = [nextCard(), nextCard()];
  const banker = [nextCard(), nextCard()];
  let pVal = handVal(player), bVal = handVal(banker);

  const natural = pVal >= 8 || bVal >= 8;
  if (!natural && pVal <= 5) {
    const draw = nextCard(); player.push(draw); pVal = handVal(player);
    const pThird = cardVal(draw.r);
    if (bVal <= 2 || (bVal === 3 && pThird !== 8) || (bVal === 4 && [2,3,4,5,6,7].includes(pThird)) ||
        (bVal === 5 && [4,5,6,7].includes(pThird)) || (bVal === 6 && [6,7].includes(pThird))) {
      banker.push(nextCard()); bVal = handVal(banker);
    }
  } else if (!natural && bVal <= 5) {
    banker.push(nextCard()); bVal = handVal(banker);
  }

  const trueResult = pVal > bVal ? 'p' : bVal > pVal ? 'b' : 't';
  const betLabels = { p: '👤 Player', b: '🏦 Banker', t: '🤝 Tie' };
  let won = betOn === trueResult;
  let winnings = 0;

  if (won) {
    const mult = betOn === 't' ? 8 : 2;
    winnings = calcPayout(bet, mult);
    addWin(message.author.id, winnings, isDemo);
  } else if (trueResult === 't' && betOn !== 't') {
    const push = tiePayout(bet);
    addWin(message.author.id, push, isDemo);
    winnings = push;
  }

  recordGame(message.author.id, won, won ? winnings - bet : bet);
  const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

  saveGameRecord({
    gameId: game.gameId, type: 'baccarat', userId: message.author.id,
    serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
    clientSeed: game.clientSeed, nonce: game.nonce,
    inputs: { betOn },
    outcome: {
      playerHand: handStr(player), bankerHand: handStr(banker),
      pVal, bVal, winner: trueResult, result: won ? 'win' : trueResult === 't' && betOn !== 't' ? 'push' : 'lose',
    },
  });

  const embed = new EmbedBuilder()
    .setColor(won ? config.colors.success : trueResult === 't' && betOn !== 't' ? config.colors.warning : config.colors.error)
    .setTitle(`🃏 Baccarat Result${balLabel(isDemo)}`)
    .addFields(
      { name: `👤 Player (${pVal})`, value: handStr(player), inline: true },
      { name: `🏦 Banker (${bVal})`, value: handStr(banker), inline: true },
    )
    .setDescription([
      `**Winner: ${betLabels[trueResult]}** | Your bet: **${betLabels[betOn]}**`,
      won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` :
        trueResult === 't' && betOn !== 't' ? `🤝 Tie push — got back **${winnings.toLocaleString()}** ${config.currency}.` :
        `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n'))
    .setFooter({ text: gameIdFooter(game.gameId) })
    .setTimestamp();

  reply.edit({ embeds: [embed], components: [] }).catch(() => {});
}
