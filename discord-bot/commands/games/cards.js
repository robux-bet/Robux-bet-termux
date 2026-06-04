const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = ['♥️','♦️'];
const BLACK_SUITS = ['♠️','♣️'];
const SUIT_NAMES = { '♥️':'hearts','♦️':'diamonds','♠️':'spades','♣️':'clubs' };

// Hearts & Diamonds are 3x but VERY UNLIKELY to win naturally (8% each)
const BETS = {
  red:      { label: '🔴 Red',       mult: 2  },
  black:    { label: '⚫ Black',     mult: 2  },
  hearts:   { label: '♥️ Hearts',   mult: 3, rare: true },
  diamonds: { label: '♦️ Diamonds', mult: 3, rare: true },
  spades:   { label: '♠️ Spades',   mult: 4  },
  clubs:    { label: '♣️ Clubs',    mult: 4  },
};

function randCard(suitFilter) {
  const suit = suitFilter ? suitFilter[Math.floor(Math.random() * suitFilter.length)] : SUITS[Math.floor(Math.random() * 4)];
  return { rank: RANKS[Math.floor(Math.random() * 13)], suit };
}

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
        new ButtonBuilder().setCustomId('card_hearts').setLabel('♥️ Hearts (3x — rare)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('card_diamonds').setLabel('♦️ Diamonds (3x — rare)').setStyle(ButtonStyle.Primary),
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('card_spades').setLabel('♠️ Spades (4x)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('card_clubs').setLabel('♣️ Clubs (4x)').setStyle(ButtonStyle.Secondary),
      );
      const embed = new EmbedBuilder().setColor(config.colors.primary)
        .setTitle(`🃏 Card Guess${balLabel(isDemo)}`)
        .setDescription(`Bet: **${fmtR(bet)}** ${config.currency}\nGuess the card's color or suit!\n⚠️ *Hearts & Diamonds are rare — higher reward but unlikely!*`)
        .setTimestamp();
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
  const _u = getUser(message.author.id);
  const _m = BETS[choice].mult;
  const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Card Guess', existingMsg, null, {
    bet, mult: `${_m}x`, payout: parseFloat((bet * _m).toFixed(2)),
    balance: isDemo ? _u.demoBalance : _u.balance, isDemo,
  });

  const game = beginGame(message.author.id, 1);
  spendBet(message.author.id, bet, isDemo);

  const betInfo = BETS[choice];
  let won;

  if (isForceWin(mode)) {
    won = true;
  } else if (mode === 'lose') {
    won = false;
  } else {
    // Fair: rare suits (hearts/diamonds) have only 8% chance; others use fair float
    if (betInfo.rare) {
      won = Math.random() < 0.08;
    } else {
      // 50/50 for color bets, ~25% for specific non-rare suits
      won = choice === 'red' || choice === 'black' ? Math.random() < 0.50 : Math.random() < 0.25;
    }
  }

  // Draw a visually appropriate card
  let card;
  if (won) {
    if (choice === 'red') card = randCard(RED_SUITS);
    else if (choice === 'black') card = randCard(BLACK_SUITS);
    else if (choice === 'hearts') card = randCard(['♥️']);
    else if (choice === 'diamonds') card = randCard(['♦️']);
    else if (choice === 'spades') card = randCard(['♠️']);
    else card = randCard(['♣️']);
  } else {
    // Losing card: pick from suits that DON'T match the choice
    if (choice === 'red') card = randCard(BLACK_SUITS);
    else if (choice === 'black') card = randCard(RED_SUITS);
    else if (choice === 'hearts') { const s = ['♦️','♠️','♣️']; card = randCard(s); }
    else if (choice === 'diamonds') { const s = ['♥️','♠️','♣️']; card = randCard(s); }
    else if (choice === 'spades') card = randCard(['♥️','♦️','♣️']);
    else card = randCard(['♥️','♦️','♠️']);
  }

  const isRed = RED_SUITS.includes(card.suit);
  const mult = betInfo.mult;
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
      `Your guess: **${betInfo.label}** (${mult}x)`,
      '',
      won ? `🎉 Won **${fmtR(winnings)}** ${config.currency}!` : `😢 Lost **${fmtR(bet)}** ${config.currency}.`,
      `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n'))
    .setFooter({ text: gameIdFooter(game.gameId) })
    .setTimestamp();

  loadMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
}
