const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck.sort(() => Math.random() - 0.5);
}

function cardValue(rank) {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank);
}

function handValue(hand) {
  let val = 0, aces = 0;
  for (const c of hand) {
    val += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}

function handStr(hand, hideSecond = false) {
  return hand.map((c, i) => (hideSecond && i === 1) ? `🂠` : `${c.rank}${c.suit}`).join(' ');
}

module.exports = {
  name: 'bj',
  aliases: ['blackjack'],
  description: 'Play Blackjack against the dealer',
  usage: '.bj <bet>',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .bj <bet>`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `bj_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current Blackjack game first!')] });

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'Blackjack', userId: message.author.id, bet });

    const deck = newDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    const buildEmbed = (finished = false, result = '') => {
      const pVal = handValue(player);
      const dVal = finished ? handValue(dealer) : cardValue(dealer[0].rank);
      return new EmbedBuilder()
        .setColor(result === 'win' ? config.colors.success : result === 'lose' ? config.colors.error : result === 'push' ? config.colors.warning : config.colors.primary)
        .setTitle('🃏 Blackjack')
        .addFields(
          { name: `Your Hand (${pVal})`, value: handStr(player), inline: false },
          { name: `Dealer's Hand (${finished ? dVal : '?'})`, value: handStr(dealer, !finished), inline: false },
        )
        .setFooter({ text: finished ? result.toUpperCase() : 'Hit, Stand, or Double Down' })
        .setTimestamp();
    };

    const row = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('👆 Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bj_double').setLabel('2️⃣ Double').setStyle(ButtonStyle.Danger),
    );

    // Check natural blackjack
    if (handValue(player) === 21) {
      const dealerVal = handValue(dealer);
      client.activeGames.delete(gameKey);
      if (dealerVal === 21) {
        addBalance(message.author.id, bet);
        recordGame(message.author.id, false, 0);
        return message.reply({ embeds: [buildEmbed(true, 'push').setDescription('Both got Blackjack! **Push** — bet returned.')] });
      }
      const win = Math.floor(bet * 1.5);
      addBalance(message.author.id, bet + win);
      recordGame(message.author.id, true, win);
      return message.reply({ embeds: [buildEmbed(true, 'win').setDescription(`🎉 **Blackjack!** Won **${win.toLocaleString()}** ${config.currency}!`)] });
    }

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row()] });
    let doubled = false;

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    async function endGame(i) {
      // Dealer plays
      while (handValue(dealer) < 17) dealer.push(deck.pop());
      const pVal = handValue(player);
      const dVal = handValue(dealer);
      let result, winnings = 0;
      if (pVal > 21) { result = 'lose'; }
      else if (dVal > 21 || pVal > dVal) { result = 'win'; winnings = doubled ? bet * 2 : bet; addBalance(message.author.id, (doubled ? bet * 2 : bet) + winnings); }
      else if (pVal === dVal) { result = 'push'; addBalance(message.author.id, doubled ? bet * 2 : bet); }
      else { result = 'lose'; }
      recordGame(message.author.id, result === 'win', winnings);
      const newBal = getUser(message.author.id).balance;
      const embed = buildEmbed(true, result);
      embed.addFields({ name: '💰 Balance', value: `**${newBal.toLocaleString()}** ${config.currency}` });
      if (i) await i.update({ embeds: [embed], components: [] }).catch(() => {});
      else reply.edit({ embeds: [embed], components: [] }).catch(() => {});
      client.activeGames.delete(gameKey);
    }

    collector.on('collect', async i => {
      if (i.customId === 'bj_hit') {
        player.push(deck.pop());
        if (handValue(player) >= 21) {
          collector.stop();
          await i.deferUpdate();
          await endGame(null);
        } else {
          await i.update({ embeds: [buildEmbed()], components: [row()] });
        }
      } else if (i.customId === 'bj_stand') {
        collector.stop();
        await i.deferUpdate();
        await endGame(null);
      } else if (i.customId === 'bj_double') {
        if (getUser(message.author.id).balance < bet) {
          await i.reply({ embeds: [errorEmbed('Insufficient Funds', 'Not enough to double down!')], ephemeral: true });
          return;
        }
        removeBalance(message.author.id, bet);
        doubled = true;
        player.push(deck.pop());
        collector.stop();
        await i.deferUpdate();
        await endGame(null);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        client.activeGames.delete(gameKey);
        addBalance(message.author.id, bet);
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
