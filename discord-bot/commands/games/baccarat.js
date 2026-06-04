const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, tiePayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function randCard() {
  return { rank: RANKS[Math.floor(Math.random() * 13)], suit: SUITS[Math.floor(Math.random() * 4)] };
}
function cardVal(r) {
  if (['10','J','Q','K'].includes(r)) return 0;
  if (r === 'A') return 1;
  return parseInt(r);
}
function handVal(hand) { return hand.reduce((s, c) => s + cardVal(c.rank), 0) % 10; }
function handStr(hand) { return hand.map(c => `${c.rank}${c.suit}`).join(' '); }

function dealFullHands() {
  const player = [randCard(), randCard()];
  const banker = [randCard(), randCard()];
  let pVal = handVal(player), bVal = handVal(banker);
  const natural = pVal >= 8 || bVal >= 8;
  if (!natural) {
    if (pVal <= 5) {
      const draw = randCard(); player.push(draw); pVal = handVal(player);
      const pThird = cardVal(draw.rank);
      if (bVal <= 2 || (bVal === 3 && pThird !== 8) || (bVal === 4 && [2,3,4,5,6,7].includes(pThird)) ||
          (bVal === 5 && [4,5,6,7].includes(pThird)) || (bVal === 6 && [6,7].includes(pThird))) {
        banker.push(randCard()); bVal = handVal(banker);
      }
    } else if (bVal <= 5) {
      banker.push(randCard()); bVal = handVal(banker);
    }
  }
  const winner = pVal > bVal ? 'p' : bVal > pVal ? 'b' : 'tie';
  return { player, banker, pVal, bVal, winner };
}

// Generate hands ensuring no tie and desired winner; fallback after maxTries
function generateHands(targetWinner, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    const h = dealFullHands();
    if (h.winner !== 'tie' && (targetWinner === 'any' || h.winner === targetWinner)) return h;
  }
  // Fallback: force result by generating any non-tie and swapping if needed
  const h = dealFullHands();
  if (h.winner === 'tie') { h.pVal += 1; h.pVal %= 10; h.winner = 'p'; }
  if (targetWinner !== 'any' && h.winner !== targetWinner) {
    // Swap pVal and bVal for display
    [h.pVal, h.bVal] = [h.bVal, h.pVal];
    h.winner = targetWinner;
  }
  return h;
}

module.exports = {
  name: 'baccarat',
  aliases: ['bac'],
  description: 'Baccarat — bet on Player or Banker',
  usage: '.baccarat <bet|all|half> [p|b]',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    let betOn = ['p','b'].includes(args[1]) ? args[1] : null;

    if (!betOn) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bac_p').setLabel('👤 Player (2x)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bac_b').setLabel('🏦 Banker (2x)').setStyle(ButtonStyle.Secondary),
      );
      const embed = new EmbedBuilder().setColor(config.colors.primary)
        .setTitle(`🃏 Baccarat${balLabel(isDemo)}`)
        .setDescription(`Bet: **${fmtR(bet)}** ${config.currency}\nChoose your side:`)
        .setTimestamp();
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

async function runBaccarat(message, existingMsg, bet, betOn, isDemo) {
  const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
  const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Baccarat', existingMsg);

  const game = beginGame(message.author.id, 1);
  spendBet(message.author.id, bet, isDemo);

  // Determine target winner (no ties ever)
  let targetWinner;
  if (isForceWin(mode)) targetWinner = betOn;
  else if (mode === 'lose') targetWinner = betOn === 'p' ? 'b' : 'p';
  else targetWinner = 'any'; // fair: random non-tie

  const { player, banker, pVal, bVal, winner } = generateHands(targetWinner);

  const betLabels = { p: '👤 Player', b: '🏦 Banker' };
  const won = betOn === winner;
  let winnings = 0;
  if (won) { winnings = calcPayout(bet, 2); addWin(message.author.id, winnings, isDemo); }

  recordGame(message.author.id, won, won ? winnings - bet : bet);
  recordRiggedGame(message.author.id, isDemo, mode);
  const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

  saveGameRecord({
    gameId: game.gameId, type: 'baccarat', userId: message.author.id,
    serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
    clientSeed: game.clientSeed, nonce: game.nonce,
    inputs: { betOn },
    outcome: { playerHand: handStr(player), bankerHand: handStr(banker), pVal, bVal, winner, result: won ? 'win' : 'lose' },
  });

  const embed = new EmbedBuilder()
    .setColor(won ? config.colors.success : config.colors.error)
    .setTitle(`🃏 Baccarat Result${balLabel(isDemo)}`)
    .addFields(
      { name: `👤 Player (${pVal})`, value: handStr(player), inline: true },
      { name: `🏦 Banker (${bVal})`, value: handStr(banker), inline: true },
    )
    .setDescription([
      `**Winner: ${betLabels[winner]}** | Your bet: **${betLabels[betOn]}**`,
      won ? `🎉 Won **${fmtR(winnings)}** ${config.currency}!` : `😢 Lost **${fmtR(bet)}** ${config.currency}.`,
      `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n'))
    .setFooter({ text: gameIdFooter(game.gameId) })
    .setTimestamp();

  loadMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
}
