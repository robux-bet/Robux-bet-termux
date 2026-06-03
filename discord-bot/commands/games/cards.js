const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = ['♥️','♦️'];
const SUIT_NAMES = { '♥️': 'hearts', '♦️': 'diamonds', '♠️': 'spades', '♣️': 'clubs' };

const BETS = {
  red:      { label: '🔴 Red',      mult: 2 },
  black:    { label: '⚫ Black',    mult: 2 },
  hearts:   { label: '♥️ Hearts',  mult: 4 },
  diamonds: { label: '♦️ Diamonds',mult: 4 },
  spades:   { label: '♠️ Spades',  mult: 4 },
  clubs:    { label: '♣️ Clubs',   mult: 4 },
};

module.exports = {
  name: 'cards',
  description: 'Guess if a flipped card is Red/Black or a specific suit',
  usage: '.cards <bet|all|half> [red|black|hearts|diamonds|spades|clubs]',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    let choice = args[1]?.toLowerCase();
    if (!choice || !BETS[choice]) {
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('card_red').setLabel('🔴 Red (2x)').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('card_black').setLabel('⚫ Black (2x)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('card_hearts').setLabel('♥️ Hearts (4x)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('card_diamonds').setLabel('♦️ Diamonds (4x)').setStyle(ButtonStyle.Primary),
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('card_spades').setLabel('♠️ Spades (4x)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('card_clubs').setLabel('♣️ Clubs (4x)').setStyle(ButtonStyle.Secondary),
      );
      const embed = new EmbedBuilder().setColor(config.colors.primary)
        .setTitle(`🃏 Card Guess${balLabel(isDemo)}`).setDescription(`Bet: **${bet.toLocaleString()}** ${config.currency}\nGuess the card's color or suit!`).setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row1, row2] });
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button, filter: i => i.user.id === message.author.id, time: 30000, max: 1,
      });
      collector.on('collect', async i => {
        choice = i.customId.replace('card_', '');
        await i.deferUpdate();
        await resolve(message, reply, bet, choice, isDemo);
      });
      collector.on('end', (_, r) => { if (r === 'time') reply.edit({ components: [] }).catch(() => {}); });
      return;
    }

    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(`🃏 Card Guess${balLabel(isDemo)}`).setTimestamp()] });
    await resolve(message, reply, bet, choice, isDemo);
  },
};

async function resolve(message, existingMsg, bet, choice, isDemo) {
  const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
  const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Card Guess', existingMsg);

  const game = beginGame(message.author.id, 2);
  spendBet(message.author.id, bet, isDemo);

  const rankIdx = Math.floor(game.floats[0] * 13);
  const suitIdx = Math.floor(game.floats[1] * 4);
  const card = { rank: RANKS[rankIdx], suit: SUITS[suitIdx] };
  const isRed = RED_SUITS.includes(card.suit);
  const suitName = SUIT_NAMES[card.suit];

  let won;
  if (choice === 'red') won = isRed;
  else if (choice === 'black') won = !isRed;
  else won = suitName === choice;

  if (isForceWin(mode)) won = true;
  else if (mode === 'lose') won = false;

  const { mult } = BETS[choice];
  const winnings = won ? calcPayout(bet, mult) : 0;
  if (won) addWin(message.author.id, winnings, isDemo);
  recordGame(message.author.id, won, won ? winnings - bet : bet);
  recordRiggedGame(message.author.id, isDemo, mode);
  const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

  saveGameRecord({
    gameId: game.gameId, type: 'cards', userId: message.author.id,
    serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
    clientSeed: game.clientSeed, nonce: game.nonce,
    inputs: { choice },
    outcome: { card: `${card.rank}${card.suit}`, result: won ? 'win' : 'lose' },
  });

  const embed = new EmbedBuilder()
    .setColor(won ? config.colors.success : config.colors.error)
    .setTitle(`🃏 Card Guess Result${balLabel(isDemo)}`)
    .setDescription([
      `The card was: **${card.rank}${card.suit}** (${isRed ? '🔴 Red' : '⚫ Black'})`,
      `Your guess: **${BETS[choice].label}** (${mult}x)`,
      '',
      won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` : `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n'))
    .setFooter({ text: gameIdFooter(game.gameId) })
    .setTimestamp();

  loadMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
}
