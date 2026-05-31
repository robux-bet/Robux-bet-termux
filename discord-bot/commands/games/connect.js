const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const ROWS = 6, COLS = 7;

function emptyBoard() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
}

function drop(board, col, piece) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) { board[r][col] = piece; return r; }
  }
  return -1;
}

function checkWin(board, piece) {
  // Horizontal
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++)
      if ([0,1,2,3].every(i => board[r][c+i] === piece)) return true;
  // Vertical
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r <= ROWS - 4; r++)
      if ([0,1,2,3].every(i => board[r+i][c] === piece)) return true;
  // Diag
  for (let r = 0; r <= ROWS - 4; r++)
    for (let c = 0; c <= COLS - 4; c++)
      if ([0,1,2,3].every(i => board[r+i][c+i] === piece)) return true;
  for (let r = 3; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++)
      if ([0,1,2,3].every(i => board[r-i][c+i] === piece)) return true;
  return false;
}

function scoreWindow(window, piece) {
  const opp = piece === 2 ? 1 : 2;
  let score = 0;
  const count = window.filter(c => c === piece).length;
  const empty = window.filter(c => c === 0).length;
  if (count === 4) score += 100;
  else if (count === 3 && empty === 1) score += 5;
  else if (count === 2 && empty === 2) score += 2;
  if (window.filter(c => c === opp).length === 3 && empty === 1) score -= 4;
  return score;
}

function scoreBoard(board, piece) {
  let score = 0;
  const center = board.map(r => r[3]);
  score += center.filter(c => c === piece).length * 3;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++)
      score += scoreWindow([0,1,2,3].map(i => board[r][c+i]), piece);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r <= ROWS - 4; r++)
      score += scoreWindow([0,1,2,3].map(i => board[r+i][c]), piece);
  return score;
}

function isTerminal(board) {
  return checkWin(board, 1) || checkWin(board, 2) || board[0].every(c => c !== 0);
}

function validCols(board) {
  return Array.from({ length: COLS }, (_, i) => i).filter(c => board[0][c] === 0);
}

function minimax(board, depth, alpha, beta, isMax) {
  if (depth === 0 || isTerminal(board)) {
    if (checkWin(board, 2)) return { score: 1000000 };
    if (checkWin(board, 1)) return { score: -1000000 };
    return { score: scoreBoard(board, 2) };
  }
  const cols = validCols(board);
  if (isMax) {
    let best = { score: -Infinity, col: cols[0] };
    for (const c of cols) {
      const b2 = board.map(r => [...r]);
      drop(b2, c, 2);
      const s = minimax(b2, depth - 1, alpha, beta, false).score;
      if (s > best.score) best = { score: s, col: c };
      alpha = Math.max(alpha, s);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = { score: Infinity, col: cols[0] };
    for (const c of cols) {
      const b2 = board.map(r => [...r]);
      drop(b2, c, 1);
      const s = minimax(b2, depth - 1, alpha, beta, true).score;
      if (s < best.score) best = { score: s, col: c };
      beta = Math.min(beta, s);
      if (alpha >= beta) break;
    }
    return best;
  }
}

function renderBoard(board) {
  const P1 = '🔴', P2 = '🟡', EMPTY = '⚫';
  return board.map(r => r.map(c => c === 1 ? P1 : c === 2 ? P2 : EMPTY).join('')).join('\n') +
    '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
}

module.exports = {
  name: 'connect',
  aliases: ['connect4'],
  description: 'Connect 4 vs Hard AI or another player',
  usage: '.connect <bet> [@user]',
  guildOnly: true,
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .connect <bet> [@user]`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `connect_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current Connect 4!')] });

    const opponent = message.mentions.users.first();
    const vsPlayer = opponent && !opponent.bot && opponent.id !== message.author.id;

    if (vsPlayer) {
      const oppUser = getUser(opponent.id);
      if (oppUser.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough.`)] });
      removeBalance(opponent.id, bet);
    }

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'Connect 4', userId: message.author.id, bet });

    const board = emptyBoard();
    let currentPiece = 1;
    let currentUser = message.author;
    let gameOver = false;

    const colRow = () => new ActionRowBuilder().addComponents(
      ...Array.from({ length: 7 }, (_, i) =>
        new ButtonBuilder().setCustomId(`c4_${i}`).setLabel(`${i+1}`).setStyle(ButtonStyle.Secondary).setDisabled(gameOver || board[0][i] !== 0)
      )
    );

    const buildEmbed = (status = '') => new EmbedBuilder()
      .setColor(config.colors.primary).setTitle('🔴🟡 Connect 4')
      .setDescription([
        renderBoard(board), '',
        vsPlayer
          ? `🔴 ${message.author.username} vs 🟡 ${opponent.username}`
          : `🔴 You vs 🟡 AI`,
        status || `${vsPlayer ? currentUser.username : currentPiece === 1 ? 'Your' : 'AI'}'s turn`,
      ].join('\n')).setTimestamp();

    const reply = await message.reply({ embeds: [buildEmbed()], components: [colRow()] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => vsPlayer ? i.user.id === currentUser.id : i.user.id === message.author.id,
      time: 300000,
    });

    async function doAIMove() {
      await reply.edit({ embeds: [buildEmbed('🤖 AI thinking...')], components: [colRow()] }).catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      const { col } = minimax(board.map(r => [...r]), 5, -Infinity, Infinity, true);
      drop(board, col, 2);
      if (checkWin(board, 2) || !board[0].some(c => c === 0)) {
        gameOver = true; collector.stop();
        return endGame('ai');
      }
      currentPiece = 1;
      await reply.edit({ embeds: [buildEmbed()], components: [colRow()] }).catch(() => {});
    }

    async function endGame(winner) {
      client.activeGames.delete(gameKey);
      let desc, color;
      if (winner === 'draw') {
        addBalance(message.author.id, bet);
        if (vsPlayer) addBalance(opponent.id, bet);
        desc = '🤝 **Draw!** Bets returned.'; color = config.colors.warning;
      } else if (winner === 'p1' || (!vsPlayer && winner === 'player')) {
        addBalance(message.author.id, vsPlayer ? bet * 2 : bet * 2);
        if (vsPlayer) recordGame(opponent.id, false, bet);
        recordGame(message.author.id, true, bet);
        desc = `🎉 **${message.author.username} wins!** +**${bet.toLocaleString()}** ${config.currency}!`;
        color = config.colors.success;
      } else if (winner === 'ai') {
        recordGame(message.author.id, false, bet);
        desc = `🤖 **AI wins!** Lost **${bet.toLocaleString()}** ${config.currency}.`;
        color = config.colors.error;
      } else {
        if (vsPlayer) { addBalance(opponent.id, bet * 2); recordGame(message.author.id, false, bet); recordGame(opponent.id, true, bet); }
        desc = `🏆 **${opponent?.username || 'AI'} wins!**`;
        color = config.colors.error;
      }
      const newBal = getUser(message.author.id).balance;
      const embed = new EmbedBuilder().setColor(color).setTitle('🔴🟡 Connect 4 Result')
        .setDescription([renderBoard(board), '', desc, `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`].join('\n')).setTimestamp();
      await reply.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    collector.on('collect', async i => {
      const col = parseInt(i.customId.replace('c4_', ''));
      if (board[0][col] !== 0) return i.deferUpdate();
      drop(board, col, currentPiece);
      await i.deferUpdate();
      if (checkWin(board, currentPiece)) {
        gameOver = true; collector.stop();
        return endGame(currentPiece === 1 ? 'p1' : 'p2');
      }
      if (!board[0].some(c => c === 0)) {
        gameOver = true; collector.stop();
        return endGame('draw');
      }
      currentPiece = currentPiece === 1 ? 2 : 1;
      if (vsPlayer) currentUser = currentUser.id === message.author.id ? opponent : message.author;
      await reply.edit({ embeds: [buildEmbed()], components: [colRow()] }).catch(() => {});
      if (!vsPlayer && currentPiece === 2) await doAIMove();
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        addBalance(message.author.id, bet);
        if (vsPlayer) addBalance(opponent.id, bet);
        reply.edit({ content: '⏰ Game timed out.', components: [] }).catch(() => {});
      }
    });
  },
};
