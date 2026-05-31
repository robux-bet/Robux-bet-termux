const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VAL = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };

function randomCard() {
  return { rank: RANKS[Math.floor(Math.random() * 13)], suit: SUITS[Math.floor(Math.random() * 4)] };
}

function calcMult(streak) {
  return parseFloat((1 + streak * 0.4).toFixed(2));
}

// Actual: rig next card to be wrong for player
function nextCard(current, guessedHi, isDemo) {
  if (isDemo) return randomCard();
  // Actual: 65% chance the card goes the wrong way for the player
  const curVal = RANK_VAL[current.rank];
  if (Math.random() < 0.65) {
    // Force a card that defeats the guess
    const pool = RANKS.filter(r => guessedHi ? RANK_VAL[r] < curVal : RANK_VAL[r] > curVal);
    if (pool.length === 0) return randomCard();
    const rank = pool[Math.floor(Math.random() * pool.length)];
    const suit = SUITS[Math.floor(Math.random() * 4)];
    return { rank, suit };
  }
  return randomCard();
}

module.exports = {
  name: 'hilo',
  description: 'Higher or Lower card game',
  usage: '.hilo <bet|all|half>',
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const gameKey = `hilo_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current HiLo!')] });

    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'HiLo', userId: message.author.id, bet });

    let current = randomCard();
    let streak = 0;
    let gameOver = false;

    const buildEmbed = (msg = '') => new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🃏 Hi-Lo${balLabel(isDemo)}`)
      .setDescription([
        `Current card: **${current.rank}${current.suit}** (Value: ${RANK_VAL[current.rank]})`,
        `Streak: **${streak}** | Cash out: **${calcPayout(bet, calcMult(streak))}** ${config.currency}`,
        msg,
      ].join('\n'))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hilo_hi').setLabel('⬆️ Higher').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('hilo_lo').setLabel('⬇️ Lower').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hilo_cash').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success),
    );

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'hilo_cash') {
        if (streak === 0) { await i.reply({ content: 'Make at least one correct guess first!', ephemeral: true }); return; }
        const winnings = calcPayout(bet, calcMult(streak));
        addWin(message.author.id, winnings, isDemo);
        recordGame(message.author.id, true, winnings - bet);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);
        await i.update({
          embeds: [buildEmbed(`💰 Cashed out! Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`)],
          components: [],
        });
        return;
      }

      const guessedHi = i.customId === 'hilo_hi';
      const drawn = nextCard(current, guessedHi, isDemo);
      const curVal = RANK_VAL[current.rank];
      const nextVal = RANK_VAL[drawn.rank];

      let correct;
      if (nextVal === curVal) correct = true;
      else correct = guessedHi ? nextVal > curVal : nextVal < curVal;

      if (correct) {
        streak++;
        current = drawn;
        await i.update({ embeds: [buildEmbed(`✅ **${drawn.rank}${drawn.suit}** — Correct! Streak: ${streak}`)], components: [row] });
      } else {
        recordGame(message.author.id, false, bet);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);
        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle(`🃏 Hi-Lo${balLabel(isDemo)}`)
            .setDescription([
              `Next card was **${drawn.rank}${drawn.suit}** (${nextVal}) — Wrong!`,
              `Lost **${bet.toLocaleString()}** ${config.currency}.`,
              `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
            ].join('\n')).setTimestamp()],
          components: [],
        });
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        if (streak > 0) addWin(message.author.id, calcPayout(bet, calcMult(streak)), isDemo);
        else addWin(message.author.id, bet, isDemo);
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
