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
const RANK_VAL = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
const MAX_STREAK = 8; // Hard cap — must cash out by streak 8
const MULT_PER_STREAK = 0.25; // Reduced from 0.4 — harder

function randCard() {
  return { rank: RANKS[Math.floor(Math.random() * 13)], suit: SUITS[Math.floor(Math.random() * 4)] };
}
function calcMult(streak) {
  return parseFloat((1 + streak * MULT_PER_STREAK).toFixed(2));
}

module.exports = {
  name: 'hilo',
  description: 'Higher or Lower — cash out before you guess wrong',
  usage: '.hilo <bet|all|half>',
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const gameKey = `hilo_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current HiLo!')] });

    const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Hi-Lo');

    const game = beginGame(message.author.id, 22);
    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'HiLo', userId: message.author.id, bet });

    let current = randCard();
    let streak = 0;
    let gameOver = false;
    const actions = [];
    const cardSequence = [current];

    const buildEmbed = (msg = '') => new EmbedBuilder()
      .setColor(streak >= 4 ? config.colors.warning : config.colors.primary)
      .setTitle(`🃏 Hi-Lo${balLabel(isDemo)}`)
      .setDescription([
        `Current card: **${current.rank}${current.suit}** (Value: ${RANK_VAL[current.rank]})`,
        `Streak: **${streak}/${MAX_STREAK}** | Cash out: **${fmtR(calcPayout(bet, calcMult(streak)))}** ${config.currency}`,
        streak >= MAX_STREAK ? '⚠️ Max streak reached — cash out now!' : '',
        msg,
      ].filter(Boolean).join('\n'))
      .setTimestamp();

    const buildRow = (disableCash = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hilo_hi').setLabel('⬆️ Higher').setStyle(ButtonStyle.Primary).setDisabled(streak >= MAX_STREAK),
      new ButtonBuilder().setCustomId('hilo_lo').setLabel('⬇️ Lower').setStyle(ButtonStyle.Secondary).setDisabled(streak >= MAX_STREAK),
      new ButtonBuilder().setCustomId('hilo_cash').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success).setDisabled(streak === 0 || disableCash),
    );

    await loadMsg.edit({ embeds: [buildEmbed()], components: [buildRow()] });

    const collector = loadMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'hilo_cash') {
        const mult = calcMult(streak);
        const winnings = calcPayout(bet, mult);
        addWin(message.author.id, winnings, isDemo);
        recordGame(message.author.id, true, winnings - bet);
        recordRiggedGame(message.author.id, isDemo, mode);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);

        saveGameRecord({
          gameId: game.gameId, type: 'hilo', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { actions },
          outcome: { cardSequence: cardSequence.map(c => `${c.rank}${c.suit}`), result: 'win' },
        });

        await i.update({
          embeds: [buildEmbed(`💰 Cashed out at **${mult}x**! Won **${fmtR(winnings)}** ${config.currency}!\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`).setFooter({ text: gameIdFooter(game.gameId) })],
          components: [],
        }).catch(() => {});
        return;
      }

      const guessedHi = i.customId === 'hilo_hi';
      actions.push(guessedHi ? 'hi' : 'lo');
      const drawn = randCard();
      cardSequence.push(drawn);
      const curVal = RANK_VAL[current.rank];
      const nextVal = RANK_VAL[drawn.rank];

      let correct;
      if (isForceWin(mode)) correct = true;
      else if (mode === 'lose') correct = false;
      else {
        // Hard mode: ties count as wrong; edge values are tougher
        if (nextVal === curVal) correct = false; // ties = always wrong
        else correct = guessedHi ? nextVal > curVal : nextVal < curVal;
        // Extra 25% random wrong even on correct guess (makes it harder)
        if (correct && Math.random() < 0.25) correct = false;
      }

      if (correct) {
        streak++;
        current = drawn;
        if (streak >= MAX_STREAK) {
          // Force cash-out at max streak
          await i.update({ embeds: [buildEmbed(`✅ Correct! Max streak reached — you must cash out!`)], components: [buildRow()] });
        } else {
          await i.update({ embeds: [buildEmbed(`✅ **${drawn.rank}${drawn.suit}** — Correct! Streak: ${streak}`)], components: [buildRow()] });
        }
      } else {
        recordGame(message.author.id, false, bet);
        recordRiggedGame(message.author.id, isDemo, mode);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);

        saveGameRecord({
          gameId: game.gameId, type: 'hilo', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { actions },
          outcome: { cardSequence: cardSequence.map(c => `${c.rank}${c.suit}`), result: 'lose' },
        });

        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle(`🃏 Hi-Lo${balLabel(isDemo)}`)
            .setDescription([
              `Next card was **${drawn.rank}${drawn.suit}** (${nextVal}) — Wrong!`,
              `Lost **${fmtR(bet)}** ${config.currency}.`,
              `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
            ].join('\n')).setFooter({ text: gameIdFooter(game.gameId) }).setTimestamp()],
          components: [],
        }).catch(() => {});
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        if (streak > 0) addWin(message.author.id, calcPayout(bet, calcMult(streak)), isDemo);
        else addWin(message.author.id, bet, isDemo);
        loadMsg.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
