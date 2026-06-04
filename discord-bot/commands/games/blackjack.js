const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, tiePayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, shuffleDeckFromFloats, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function buildDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}
function cardValue(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank);
}
function handValue(hand) {
  let val = 0, aces = 0;
  for (const c of hand) { val += cardValue(c.rank); if (c.rank === 'A') aces++; }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}
function handStr(hand, hideSecond = false) {
  return hand.map((c, i) => (hideSecond && i === 1) ? '🂠' : `${c.rank}${c.suit}`).join(' ');
}

module.exports = {
  name: 'bj',
  aliases: ['blackjack'],
  description: 'Play Blackjack against the dealer',
  usage: '.bj <bet|all|half>',
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const gameKey = `bj_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current Blackjack first!')] });

    const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    const _u = getUser(message.author.id);
    const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Blackjack', null, null, {
      bet, mult: '2x', payout: parseFloat((bet * 2).toFixed(2)),
      balance: isDemo ? _u.demoBalance : _u.balance, isDemo,
    });

    const game = beginGame(message.author.id, 52);
    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'Blackjack', userId: message.author.id, bet });

    let deck = shuffleDeckFromFloats(buildDeck(), game.floats);
    if (isForceWin(mode)) {
      deck = deck.filter(c => !(c.rank === 'A' && c.suit === '♠️') && !(c.rank === 'K' && c.suit === '♥️'));
      deck.unshift({ rank: 'K', suit: '♥️' }, { rank: 'A', suit: '♠️' });
    }
    let deckIdx = 0;
    const drawCard = () => deck[deckIdx++];

    let player = [drawCard(), drawCard()];
    const dealer = [drawCard(), drawCard()];
    const actions = [];

    const buildEmbed = (finished = false, result = '') => {
      const pVal = handValue(player);
      return new EmbedBuilder()
        .setColor(result === 'win' ? config.colors.success : result === 'lose' ? config.colors.error : result === 'push' ? config.colors.warning : config.colors.primary)
        .setTitle(`🃏 Blackjack${balLabel(isDemo)}`)
        .addFields(
          { name: `Your Hand (${pVal})`, value: handStr(player), inline: false },
          { name: `Dealer's Hand (${finished ? handValue(dealer) : '?'})`, value: handStr(dealer, !finished), inline: false },
        )
        .setFooter({ text: finished ? result.toUpperCase() + ' | ' + gameIdFooter(game.gameId) : 'Hit, Stand, or Double Down' })
        .setTimestamp();
    };

    const row = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('👆 Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bj_double').setLabel('2️⃣ Double').setStyle(ButtonStyle.Danger),
    );

    if (handValue(player) === 21) {
      const dealerVal = handValue(dealer);
      client.activeGames.delete(gameKey);
      let naturalResult;
      if (mode === 'lose') naturalResult = 'lose';
      else if (dealerVal === 21) naturalResult = 'push';
      else naturalResult = 'win';

      let naturalWin = 0;
      if (naturalResult === 'win') { naturalWin = calcPayout(bet, 2); addWin(message.author.id, naturalWin, isDemo); }
      else if (naturalResult === 'push') { naturalWin = tiePayout(bet); addWin(message.author.id, naturalWin, isDemo); }
      recordGame(message.author.id, naturalResult === 'win', naturalResult === 'win' ? naturalWin - bet : bet);
      recordRiggedGame(message.author.id, isDemo, mode);
      saveGameRecord({
        gameId: game.gameId, type: 'blackjack', userId: message.author.id,
        serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
        clientSeed: game.clientSeed, nonce: game.nonce,
        inputs: { actions: ['natural'] },
        outcome: { playerHand: handStr(player), dealerHand: handStr(dealer), result: naturalResult },
      });
      const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
      if (naturalResult === 'lose') return loadMsg.edit({ embeds: [buildEmbed(true, 'lose').setDescription(`😢 Lost **${fmtR(bet)}** ${config.currency}.\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`)] });
      if (naturalResult === 'push') return loadMsg.edit({ embeds: [buildEmbed(true, 'push').setDescription(`Both got Blackjack! Push — got back **${fmtR(naturalWin)}** ${config.currency}.`)] });
      return loadMsg.edit({ embeds: [buildEmbed(true, 'win').setDescription(`🎉 **Blackjack!** Won **${fmtR(naturalWin)}** ${config.currency}!\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`)] });
    }

    await loadMsg.edit({ embeds: [buildEmbed()], components: [row()] });
    let doubled = false;

    const collector = loadMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    async function endGame() {
      while (handValue(dealer) < 17) dealer.push(drawCard());
      const pVal = handValue(player);
      const dVal = handValue(dealer);
      const effectiveBet = doubled ? bet * 2 : bet;

      let result;
      if (pVal > 21) result = 'lose';
      else if (dVal > 21 || pVal > dVal) result = 'win';
      else if (pVal === dVal) result = 'push';
      else result = 'lose';

      if (mode === 'lose' && result !== 'lose') result = 'lose';
      else if (isForceWin(mode) && result === 'lose') result = 'win';

      let winnings = 0;
      if (result === 'win') { winnings = calcPayout(effectiveBet, 2); addWin(message.author.id, winnings, isDemo); }
      else if (result === 'push') { winnings = tiePayout(effectiveBet); addWin(message.author.id, winnings, isDemo); }

      recordGame(message.author.id, result === 'win', result === 'win' ? winnings - effectiveBet : effectiveBet);
      recordRiggedGame(message.author.id, isDemo, mode);
      const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
      client.activeGames.delete(gameKey);

      saveGameRecord({
        gameId: game.gameId, type: 'blackjack', userId: message.author.id,
        serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
        clientSeed: game.clientSeed, nonce: game.nonce,
        inputs: { actions, doubled },
        outcome: { playerHand: handStr(player), dealerHand: handStr(dealer), result },
      });

      const embed = buildEmbed(true, result);
      const desc = result === 'win' ? `🎉 Won **${fmtR(winnings)}** ${config.currency}!` :
        result === 'push' ? `🤝 Push — got back **${fmtR(winnings)}** ${config.currency}.` :
        `😢 Lost **${fmtR(effectiveBet)}** ${config.currency}.`;
      embed.setDescription(`${desc}\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`);
      loadMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    collector.on('collect', async i => {
      if (i.customId === 'bj_hit') {
        actions.push('hit');
        player.push(drawCard());
        if (handValue(player) >= 21) { collector.stop(); await i.deferUpdate(); await endGame(); }
        else await i.update({ embeds: [buildEmbed()], components: [row()] });
      } else if (i.customId === 'bj_stand') {
        actions.push('stand');
        collector.stop(); await i.deferUpdate(); await endGame();
      } else if (i.customId === 'bj_double') {
        const pool = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        if (pool < bet) { await i.reply({ content: 'Not enough to double down!', ephemeral: true }); return; }
        actions.push('double');
        spendBet(message.author.id, bet, isDemo);
        doubled = true;
        player.push(drawCard());
        collector.stop(); await i.deferUpdate(); await endGame();
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') { client.activeGames.delete(gameKey); addWin(message.author.id, bet, isDemo); loadMsg.edit({ components: [] }).catch(() => {}); }
    });
  },
};
