const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VAL = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13 };

function randomCard() {
  return { rank: RANKS[Math.floor(Math.random() * 13)], suit: SUITS[Math.floor(Math.random() * 4)] };
}

function calcMult(streak) {
  return parseFloat((1 + streak * 0.4).toFixed(2));
}

module.exports = {
  name: 'hilo',
  description: 'Higher or Lower card game',
  usage: '.hilo <bet>',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .hilo <bet>`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `hilo_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current HiLo game!')] });

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'HiLo', userId: message.author.id, bet });

    let current = randomCard();
    let streak = 0;
    let gameOver = false;

    const buildEmbed = (msg = '') => new EmbedBuilder()
      .setColor(gameOver ? config.colors.success : config.colors.primary)
      .setTitle('🃏 Hi-Lo')
      .setDescription([
        `Current card: **${current.rank}${current.suit}** (Value: ${RANK_VAL[current.rank]})`,
        `Streak: **${streak}** | Multiplier: **${calcMult(streak)}x**`,
        msg,
      ].join('\n'))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hilo_hi').setLabel('⬆️ Higher').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('hilo_lo').setLabel('⬇️ Lower').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hilo_cashout').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success),
    );

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'hilo_cashout') {
        if (streak === 0) { await i.reply({ content: 'Make at least one correct guess first!', ephemeral: true }); return; }
        const winnings = Math.floor(bet * calcMult(streak));
        addBalance(message.author.id, winnings);
        recordGame(message.author.id, true, winnings - bet);
        const newBal = getUser(message.author.id).balance;
        gameOver = true;
        collector.stop();
        await i.update({ embeds: [buildEmbed(`💰 Cashed out! Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`)], components: [] });
        client.activeGames.delete(gameKey);
        return;
      }

      const next = randomCard();
      const curVal = RANK_VAL[current.rank];
      const nextVal = RANK_VAL[next.rank];
      const guessedHi = i.customId === 'hilo_hi';

      let correct;
      if (nextVal === curVal) correct = true; // Tie = correct (house freebie)
      else correct = guessedHi ? nextVal > curVal : nextVal < curVal;

      if (correct) {
        streak++;
        current = next;
        await i.update({ embeds: [buildEmbed(`✅ Next card: **${next.rank}${next.suit}** — Correct! (+${streak} streak)`)], components: [row] });
      } else {
        recordGame(message.author.id, false, bet);
        const newBal = getUser(message.author.id).balance;
        gameOver = true;
        collector.stop();
        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('🃏 Hi-Lo').setDescription([
            `Next card was **${next.rank}${next.suit}** (Value: ${nextVal}) — Wrong guess!`,
            `Lost **${bet.toLocaleString()}** ${config.currency}.`,
            `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
          ].join('\n')).setTimestamp()],
          components: [],
        });
        client.activeGames.delete(gameKey);
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        if (streak > 0) addBalance(message.author.id, Math.floor(bet * calcMult(streak)));
        else addBalance(message.author.id, bet);
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
