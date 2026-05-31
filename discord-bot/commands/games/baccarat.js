const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return d.sort(() => Math.random() - 0.5);
}

function cardVal(r) {
  if (['10','J','Q','K'].includes(r)) return 0;
  if (r === 'A') return 1;
  return parseInt(r);
}

function handVal(hand) {
  return hand.reduce((s, c) => s + cardVal(c.r), 0) % 10;
}

function handStr(hand) {
  return hand.map(c => `${c.r}${c.s}`).join(' ');
}

module.exports = {
  name: 'baccarat',
  aliases: ['bac'],
  description: 'Baccarat — bet on Player, Banker, or Tie',
  usage: '.baccarat <bet> [p|b|t]',
  async execute(message, args) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .baccarat <bet> [p|b|t]`\n`p` = Player · `b` = Banker · `t` = Tie')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    let betOn = ['p','b','t'].includes(args[1]) ? args[1] : null;

    if (!betOn) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bac_p').setLabel('👤 Player (2x)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bac_b').setLabel('🏦 Banker (1.95x)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bac_t').setLabel('🤝 Tie (9x)').setStyle(ButtonStyle.Success),
      );
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('🃏 Baccarat').setDescription(`Bet: **${bet.toLocaleString()}** ${config.currency}\nChoose your bet:`).setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row] });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button, filter: i => i.user.id === message.author.id, time: 30000, max: 1,
      });
      collector.on('collect', async i => {
        betOn = i.customId.replace('bac_', '');
        await i.deferUpdate();
        await runBaccarat(message, reply, bet, betOn);
      });
      collector.on('end', (_, reason) => { if (reason === 'time') reply.edit({ components: [] }).catch(() => {}); });
      return;
    }

    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle('🃏 Baccarat').setTimestamp()] });
    await runBaccarat(message, reply, bet, betOn);
  },
};

async function runBaccarat(message, reply, bet, betOn) {
  const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
  const config = require('../../config');

  removeBalance(message.author.id, bet);

  const deck = newDeck();
  const player = [deck.pop(), deck.pop()];
  const banker = [deck.pop(), deck.pop()];

  let pVal = handVal(player), bVal = handVal(banker);

  // Natural win check (8 or 9)
  const natural = pVal >= 8 || bVal >= 8;

  // Player draw rule
  if (!natural && pVal <= 5) {
    const draw = deck.pop();
    player.push(draw);
    pVal = handVal(player);

    // Banker draw rule
    const pThird = cardVal(draw.r);
    if (bVal <= 2 || (bVal === 3 && pThird !== 8) || (bVal === 4 && [2,3,4,5,6,7].includes(pThird)) ||
        (bVal === 5 && [4,5,6,7].includes(pThird)) || (bVal === 6 && [6,7].includes(pThird))) {
      banker.push(deck.pop());
      bVal = handVal(banker);
    }
  } else if (!natural && bVal <= 5) {
    banker.push(deck.pop());
    bVal = handVal(banker);
  }

  let result, winnings = 0;
  if (pVal > bVal) result = 'p';
  else if (bVal > pVal) result = 'b';
  else result = 't';

  const betLabels = { p: '👤 Player', b: '🏦 Banker', t: '🤝 Tie' };
  let won = false;

  if (betOn === result) {
    won = true;
    const mult = betOn === 't' ? 9 : betOn === 'b' ? 1.95 : 2;
    winnings = Math.floor(bet * mult);
    addBalance(message.author.id, winnings);
  } else if (result === 't' && betOn !== 't') {
    // Tie pushes non-tie bets
    addBalance(message.author.id, bet);
  }

  recordGame(message.author.id, won, won ? winnings - bet : bet);
  const newBal = getUser(message.author.id).balance;

  const embed = new EmbedBuilder()
    .setColor(won ? config.colors.success : result === 't' && betOn !== 't' ? config.colors.warning : config.colors.error)
    .setTitle('🃏 Baccarat Result')
    .addFields(
      { name: `👤 Player (${pVal})`, value: handVal === 8 || pVal === 9 ? `${handStr(player)} 🌟 Natural!` : handStr(player), inline: true },
      { name: `🏦 Banker (${bVal})`, value: bVal === 8 || bVal === 9 ? `${handStr(banker)} 🌟 Natural!` : handStr(banker), inline: true },
    )
    .setDescription([
      `**Winner: ${betLabels[result]}** | Your bet: **${betLabels[betOn]}**`,
      '',
      won ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}!` :
        result === 't' && betOn !== 't' ? `🤝 Tie — Bet returned.` :
        `😢 Lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
    ].join('\n'))
    .setTimestamp();

  reply.edit({ embeds: [embed], components: [] }).catch(() => {});
}
