const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = ['♥️', '♦️'];

function randomCard() {
  return { rank: RANKS[Math.floor(Math.random() * 13)], suit: SUITS[Math.floor(Math.random() * 4)] };
}

module.exports = {
  name: 'cards',
  description: 'Guess if a flipped card is Red or Black (or pick a suit for bigger payout)',
  usage: '.cards <bet> [red|black|hearts|diamonds|spades|clubs]',
  async execute(message, args) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .cards <bet> [red|black|hearts|diamonds|spades|clubs]`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const betOptions = {
      red: { label: '🔴 Red', mult: 2 },
      black: { label: '⚫ Black', mult: 2 },
      hearts: { label: '♥️ Hearts', mult: 4 },
      diamonds: { label: '♦️ Diamonds', mult: 4 },
      spades: { label: '♠️ Spades', mult: 4 },
      clubs: { label: '♣️ Clubs', mult: 4 },
    };

    let choice = args[1]?.toLowerCase();

    if (!choice || !betOptions[choice]) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('card_red').setLabel('🔴 Red (2x)').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('card_black').setLabel('⚫ Black (2x)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('card_hearts').setLabel('♥️ Hearts (4x)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('card_diamonds').setLabel('♦️ Diamonds (4x)').setStyle(ButtonStyle.Primary),
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('card_spades').setLabel('♠️ Spades (4x)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('card_clubs').setLabel('♣️ Clubs (4x)').setStyle(ButtonStyle.Primary),
      );

      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('🃏 Card Guess').setDescription(`Bet: **${bet.toLocaleString()}** ${config.currency}\n\nA card is face-down. Guess its color or suit!`).setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row, row2] });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button, filter: i => i.user.id === message.author.id, time: 30000, max: 1,
      });
      collector.on('collect', async i => {
        choice = i.customId.replace('card_', '');
        await i.deferUpdate();
        await resolveGame(message, reply, bet, choice, betOptions);
      });
      collector.on('end', (_, r) => { if (r === 'time') reply.edit({ components: [] }).catch(() => {}); });
      return;
    }

    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle('🃏 Card Guess').setTimestamp()] });
    await resolveGame(message, reply, bet, choice, betOptions);
  },
};

async function resolveGame(message, reply, bet, choice, betOptions) {
  const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
  const config = require('../../config');
  const RED_SUITS = ['♥️', '♦️'];
  const SUITS = ['♠️', '♥️', '♦️', '♣️'];
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  removeBalance(message.author.id, bet);

  const card = { rank: RANKS[Math.floor(Math.random() * 13)], suit: SUITS[Math.floor(Math.random() * 4)] };
  const isRed = RED_SUITS.includes(card.suit);
  const suitName = card.suit === '♥️' ? 'hearts' : card.suit === '♦️' ? 'diamonds' : card.suit === '♠️' ? 'spades' : 'clubs';
  const colorName = isRed ? 'red' : 'black';

  let won = false;
  if (choice === 'red' || choice === 'black') won = choice === colorName;
  else won = choice === suitName;

  const { mult, label } = betOptions[choice];
  const winnings = won ? Math.floor(bet * mult) : 0;
  if (won) addBalance(message.author.id, winnings);
  recordGame(message.author.id, won, won ? winnings - bet : bet);
  const newBal = getUser(message.author.id).balance;

  // Animate flip
  await new Promise(r => setTimeout(r, 800));

  const embed = new EmbedBuilder()
    .setColor(won ? config.colors.success : config.colors.error)
    .setTitle('🃏 Card Guess Result')
    .setDescription([
      `The card was: **${card.rank}${card.suit}** (${isRed ? '🔴 Red' : '⚫ Black'})`,
      `Your guess: **${betOptions[choice].label}** (${mult}x)`,
      '',
      won ? `🎉 Correct! Won **${winnings.toLocaleString()}** ${config.currency}!` : `😢 Wrong! Lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
    ].join('\n'))
    .setTimestamp();

  reply.edit({ embeds: [embed], components: [] }).catch(() => {});
}
