const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, deriveMineBoardFromFloats, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const GRID = 4;
const TOTAL = GRID * GRID;

function calcMultiplier(revealed, mines) {
  const safe = TOTAL - mines;
  let mult = 1.0;
  for (let i = 0; i < revealed; i++) mult *= (safe - i) / (TOTAL - i);
  return Math.max(1, parseFloat((0.97 / mult).toFixed(2)));
}

module.exports = {
  name: 'mines',
  description: 'Minesweeper — reveal gems without hitting a mine!',
  usage: '.mines <bet|all|half> [mines 1-15]',
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const mineCount = Math.min(15, Math.max(1, parseInt(args[1]) || 3));

    const gameKey = `mines_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current mines game!')] });

    const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Mines');

    const game = beginGame(message.author.id, TOTAL);
    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'Mines', userId: message.author.id, bet });

    const mineSet = deriveMineBoardFromFloats(game.floats, TOTAL, mineCount);
    const isMine = Array.from({ length: TOTAL }, (_, i) => mineSet.has(i));
    const forceWinGame = isForceWin(mode);
    const effectiveIsMine = mode === 'lose' ? Array(TOTAL).fill(true) : isMine;

    const state = Array(TOTAL).fill(null);
    let revealed = 0;
    let gameOver = false;
    const revealedTiles = [];

    const buildRows = (showAll = false) => {
      const rows = [];
      for (let r = 0; r < GRID; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < GRID; c++) {
          const idx = r * GRID + c;
          const s = state[idx];
          let label = '⬜', style = ButtonStyle.Secondary, disabled = false;
          if (s === 'gem') { label = '💎'; style = ButtonStyle.Success; disabled = true; }
          else if (s === 'mine') { label = '💣'; style = ButtonStyle.Danger; disabled = true; }
          else if (showAll && isMine[idx]) { label = '💣'; style = ButtonStyle.Danger; disabled = true; }
          else if (gameOver) disabled = true;
          row.addComponents(new ButtonBuilder().setCustomId(`mine_${idx}`).setLabel(label).setStyle(style).setDisabled(disabled));
        }
        rows.push(row);
      }
      const mult = calcMultiplier(revealed, mineCount);
      const cashoutVal = calcPayout(bet, mult, true);
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('mine_cashout')
          .setLabel(`💰 Cash Out (${mult}x → ${cashoutVal})`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(revealed === 0 || gameOver)
      ));
      return rows;
    };

    const buildEmbed = (status = '') => new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`💣 Mines${balLabel(isDemo)}`)
      .setDescription([
        `Bet: **${fmtR(bet)}** ${config.currency} | Mines: **${mineCount}** | Gems found: **${revealed}**`,
        status,
      ].filter(Boolean).join('\n'))
      .setTimestamp();

    await loadMsg.edit({ embeds: [buildEmbed()], components: buildRows() });

    const collector = loadMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'mine_cashout') {
        const mult = calcMultiplier(revealed, mineCount);
        const winnings = calcPayout(bet, mult, true);
        addWin(message.author.id, winnings, isDemo);
        recordGame(message.author.id, true, winnings - bet);
        recordRiggedGame(message.author.id, isDemo, mode);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);

        saveGameRecord({
          gameId: game.gameId, type: 'mines', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { mineCount, revealed: revealedTiles },
          outcome: { minePositions: [...mineSet], result: 'win' },
        });

        await i.update({
          embeds: [buildEmbed(`💰 Cashed out at **${mult}x**! Won **${fmtR(winnings)}** ${config.currency}!\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`).setFooter({ text: gameIdFooter(game.gameId) })],
          components: buildRows(true),
        }).catch(() => {});
        return;
      }

      const idx = parseInt(i.customId.replace('mine_', ''));
      if (isNaN(idx) || state[idx] !== null) return i.deferUpdate();

      if (effectiveIsMine[idx] && !forceWinGame) {
        state[idx] = 'mine';
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);
        recordGame(message.author.id, false, bet);
        recordRiggedGame(message.author.id, isDemo, mode);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

        saveGameRecord({
          gameId: game.gameId, type: 'mines', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { mineCount, revealed: revealedTiles },
          outcome: { minePositions: [...mineSet], hitMine: idx, result: 'lose' },
        });

        await i.update({
          embeds: [buildEmbed(`💥 Hit a mine! Lost **${fmtR(bet)}** ${config.currency}.\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`).setFooter({ text: gameIdFooter(game.gameId) })],
          components: buildRows(true),
        }).catch(() => {});
      } else {
        state[idx] = 'gem';
        revealedTiles.push(idx);
        revealed++;
        if (revealed === TOTAL - mineCount) {
          const mult = calcMultiplier(revealed, mineCount);
          const winnings = calcPayout(bet, mult, true);
          addWin(message.author.id, winnings, isDemo);
          recordGame(message.author.id, true, winnings - bet);
          recordRiggedGame(message.author.id, isDemo, mode);
          gameOver = true; collector.stop(); client.activeGames.delete(gameKey);
          const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

          saveGameRecord({
            gameId: game.gameId, type: 'mines', userId: message.author.id,
            serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
            clientSeed: game.clientSeed, nonce: game.nonce,
            inputs: { mineCount, revealed: revealedTiles },
            outcome: { minePositions: [...mineSet], result: 'win' },
          });

          await i.update({
            embeds: [buildEmbed(`🎉 All gems found! Won **${fmtR(winnings)}** ${config.currency}!\n💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`).setFooter({ text: gameIdFooter(game.gameId) })],
            components: buildRows(true),
          }).catch(() => {});
        } else {
          await i.update({ embeds: [buildEmbed()], components: buildRows() }).catch(() => {});
        }
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        if (revealed > 0) addWin(message.author.id, calcPayout(bet, calcMultiplier(revealed, mineCount), true), isDemo);
        else addWin(message.author.id, bet, isDemo);
        loadMsg.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
