const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, tiePayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d.sort(() => Math.random() - 0.5);
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

// Rig dealer behaviour: demo = dealer hits on 17+, actual = dealer stands on 13 (harder for player)
function dealerShouldHit(dealerVal, isDemo) {
  return isDemo ? dealerVal < 17 : dealerVal < 20;
}

// Rig initial player hand: demo sometimes gives better starting hands
function maybeBoostHand(deck, hand, isDemo) {
  if (isDemo && Math.random() < 0.35) {
    // Swap a bad card for something good
    hand[0] = { rank: ['10','J','Q','K','A'][Math.floor(Math.random()*5)], suit: SUITS[Math.floor(Math.random()*4)] };
  }
  return hand;
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

    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'Blackjack', userId: message.author.id, bet });

    const deck = newDeck();
    let player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];
    player = maybeBoostHand(deck, player, isDemo);

    const buildEmbed = (finished = false, result = '') => {
      const pVal = handValue(player);
      const dVal = finished ? handValue(dealer) : cardValue(dealer[0].rank);
      return new EmbedBuilder()
        .setColor(result === 'win' ? config.colors.success : result === 'lose' ? config.colors.error : result === 'push' ? config.colors.warning : config.colors.primary)
        .setTitle(`🃏 Blackjack${balLabel(isDemo)}`)
        .addFields(
          { name: `Your Hand (${pVal})`, value: handStr(player), inline: false },
          { name: `Dealer's Hand (${finished ? handValue(dealer) : '?'})`, value: handStr(dealer, !finished), inline: false },
        )
        .setFooter({ text: finished ? result.toUpperCase() : 'Hit, Stand, or Double Down' })
        .setTimestamp();
    };

    const row = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('👆 Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bj_double').setLabel('2️⃣ Double').setStyle(ButtonStyle.Danger),
    );

    // Natural blackjack check
    if (handValue(player) === 21) {
      const dealerVal = handValue(dealer);
      client.activeGames.delete(gameKey);
      if (dealerVal === 21) {
        const push = tiePayout(bet);
        addWin(message.author.id, push, isDemo);
        recordGame(message.author.id, false, 0);
        return message.reply({ embeds: [buildEmbed(true, 'push').setDescription(`Both got Blackjack! Push — got back **${push.toLocaleString()}** ${config.currency}.`)] });
      }
      const win = calcPayout(bet, 2);
      addWin(message.author.id, win, isDemo);
      recordGame(message.author.id, true, win - bet);
      const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
      return message.reply({ embeds: [buildEmbed(true, 'win').setDescription(`🎉 **Blackjack!** Won **${win.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`)] });
    }

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row()] });
    let doubled = false;

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    async function endGame() {
      while (dealerShouldHit(handValue(dealer), isDemo)) dealer.push(deck.pop());
      const pVal = handValue(player);
      const dVal = handValue(dealer);
      const effectiveBet = doubled ? bet * 2 : bet;
      let result, winnings = 0;

      if (pVal > 21) {
        result = 'lose';
      } else if (dVal > 21 || pVal > dVal) {
        result = 'win';
        winnings = calcPayout(effectiveBet, 2);
        addWin(message.author.id, winnings, isDemo);
      } else if (pVal === dVal) {
        result = 'push';
        const push = tiePayout(effectiveBet);
        addWin(message.author.id, push, isDemo);
        winnings = push;
      } else {
        result = 'lose';
      }

      recordGame(message.author.id, result === 'win', result === 'win' ? winnings - effectiveBet : effectiveBet);
      const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
      client.activeGames.delete(gameKey);

      const embed = buildEmbed(true, result);
      const desc = result === 'win' ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` :
        result === 'push' ? `🤝 Push — got back **${winnings.toLocaleString()}** ${config.currency}.` :
        `😢 Lost **${effectiveBet.toLocaleString()}** ${config.currency}.`;
      embed.setDescription(`${desc}\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`);
      reply.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    collector.on('collect', async i => {
      if (i.customId === 'bj_hit') {
        player.push(deck.pop());
        if (handValue(player) >= 21) { collector.stop(); await i.deferUpdate(); await endGame(); }
        else await i.update({ embeds: [buildEmbed()], components: [row()] });
      } else if (i.customId === 'bj_stand') {
        collector.stop(); await i.deferUpdate(); await endGame();
      } else if (i.customId === 'bj_double') {
        const pool = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        if (pool < bet) { await i.reply({ content: 'Not enough to double down!', ephemeral: true }); return; }
        spendBet(message.author.id, bet, isDemo);
        doubled = true;
        player.push(deck.pop());
        collector.stop(); await i.deferUpdate(); await endGame();
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') { client.activeGames.delete(gameKey); addWin(message.author.id, bet, isDemo); reply.edit({ components: [] }).catch(() => {}); }
    });
  },
};
