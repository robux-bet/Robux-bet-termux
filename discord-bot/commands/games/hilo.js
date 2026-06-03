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
const RANK_VAL = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };

function cardFromFloats(f0, f1) {
  return { rank: RANKS[Math.floor(f0 * 13)], suit: SUITS[Math.floor(f1 * 4)] };
}
function calcMult(streak) {
  return parseFloat((1 + streak * 0.4).toFixed(2));
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

    const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Hi-Lo');

    const game = beginGame(message.author.id, 22);
    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'HiLo', userId: message.author.id, bet });

    const cards = [];
    for (let i = 0; i < 11; i++) cards.push(cardFromFloats(game.floats[i * 2], game.floats[i * 2 + 1]));

    let cardIdx = 0;
    let current = cards[cardIdx];
    let streak = 0;
    let gameOver = false;
    const actions = [];

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

    await loadMsg.edit({ embeds: [buildEmbed()], components: [row] });

    const collector = loadMsg.createMessageComponentCollector({
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
        recordRiggedGame(message.author.id, isDemo, mode);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);

        saveGameRecord({
          gameId: game.gameId, type: 'hilo', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { actions },
          outcome: { cardSequence: cards.slice(0, cardIdx + 1).map(c => `${c.rank}${c.suit}`), result: 'win' },
        });

        await i.update({
          embeds: [buildEmbed(`💰 Cashed out! Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`).setFooter({ text: gameIdFooter(game.gameId) })],
          components: [],
        });
        return;
      }

      if (cardIdx + 1 >= cards.length) {
        await i.reply({ content: 'Max cards reached — game over!', ephemeral: true });
        return;
      }

      const guessedHi = i.customId === 'hilo_hi';
      actions.push(guessedHi ? 'hi' : 'lo');
      const drawn = cards[++cardIdx];
      const curVal = RANK_VAL[current.rank];
      const nextVal = RANK_VAL[drawn.rank];

      let correct = nextVal === curVal ? true : guessedHi ? nextVal > curVal : nextVal < curVal;
      if (isForceWin(mode)) correct = true;
      else if (mode === 'lose') correct = false;

      if (correct) {
        streak++;
        current = drawn;
        await i.update({ embeds: [buildEmbed(`✅ **${drawn.rank}${drawn.suit}** — Correct! Streak: ${streak}`)], components: [row] });
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
          outcome: { cardSequence: cards.slice(0, cardIdx + 1).map(c => `${c.rank}${c.suit}`), result: 'lose' },
        });

        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle(`🃏 Hi-Lo${balLabel(isDemo)}`)
            .setDescription([
              `Next card was **${drawn.rank}${drawn.suit}** (${nextVal}) — Wrong!`,
              `Lost **${bet.toLocaleString()}** ${config.currency}.`,
              `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
            ].join('\n')).setFooter({ text: gameIdFooter(game.gameId) }).setTimestamp()],
          components: [],
        });
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
