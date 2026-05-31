const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

// Unbeatable minimax AI
function minimax(board, isMax, alpha, beta) {
  const w = checkWinner(board);
  if (w === 'O') return 10;
  if (w === 'X') return -10;
  if (!board.includes(null)) return 0;

  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'O';
        best = Math.max(best, minimax(board, false, alpha, beta));
        board[i] = null;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'X';
        best = Math.min(best, minimax(board, true, alpha, beta));
        board[i] = null;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

function bestMove(board) {
  let best = -Infinity, move = -1;
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = 'O';
      const score = minimax(board, false, -Infinity, Infinity);
      board[i] = null;
      if (score > best) { best = score; move = i; }
    }
  }
  return move;
}

function checkWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

function buildRows(board, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const val = board[idx];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${idx}`)
          .setLabel(val === 'X' ? '✖' : val === 'O' ? '⭕' : '⬜')
          .setStyle(val === 'X' ? ButtonStyle.Danger : val === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(disabled || !!val)
      );
    }
    rows.push(row);
  }
  return rows;
}

module.exports = {
  name: 'ttt',
  aliases: ['tictactoe'],
  description: 'Tic Tac Toe vs Unbeatable AI or another player',
  usage: '.ttt <bet> [@user]',
  guildOnly: true,
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .ttt <bet> [@user]`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const opponent = message.mentions.users.first();
    const vsAI = !opponent || opponent.bot;

    if (!vsAI) {
      if (opponent.id === message.author.id) return message.reply({ embeds: [errorEmbed('Invalid', 'You cannot play against yourself.')] });
      const oppUser = getUser(opponent.id);
      if (oppUser.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough ${config.currency}.`)] });
    }

    const gameKey = `ttt_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current TTT game first!')] });

    removeBalance(message.author.id, bet);
    if (!vsAI) removeBalance(opponent.id, bet);
    client.activeGames.set(gameKey, { name: 'Tic Tac Toe', userId: message.author.id, bet });

    const board = Array(9).fill(null);
    let currentPlayer = message.author; // X always goes first
    let gameOver = false;

    const buildEmbed = (status = '') => new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('❌ Tic Tac Toe')
      .setDescription([
        vsAI ? `**You (✖) vs AI (⭕)**` : `**${message.author.username} (✖) vs ${opponent.username} (⭕)**`,
        status || (vsAI ? `Your turn! You are ✖` : `${currentPlayer.username}'s turn (${currentPlayer.id === message.author.id ? '✖' : '⭕'})`),
      ].join('\n'))
      .setTimestamp();

    const reply = await message.reply({ embeds: [buildEmbed()], components: buildRows(board) });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => {
        if (vsAI) return i.user.id === message.author.id;
        return i.user.id === currentPlayer.id;
      },
      time: 120000,
    });

    async function finishGame(winner, updateFn) {
      gameOver = true;
      client.activeGames.delete(gameKey);
      collector.stop();

      let desc, color;
      if (!winner) {
        // Draw — return bets
        addBalance(message.author.id, bet);
        if (!vsAI) addBalance(opponent.id, bet);
        desc = `🤝 **Draw!** Bets returned.`;
        color = config.colors.warning;
      } else if (vsAI) {
        if (winner === 'X') {
          addBalance(message.author.id, bet * 2);
          recordGame(message.author.id, true, bet);
          desc = `🎉 **You won!** +**${bet.toLocaleString()}** ${config.currency}!`;
          color = config.colors.success;
        } else {
          recordGame(message.author.id, false, bet);
          desc = `🤖 **AI wins!** Lost **${bet.toLocaleString()}** ${config.currency}.`;
          color = config.colors.error;
        }
      } else {
        const winnerUser = winner === 'X' ? message.author : opponent;
        const loserUser = winner === 'X' ? opponent : message.author;
        addBalance(winnerUser.id, bet * 2);
        recordGame(winnerUser.id, true, bet);
        recordGame(loserUser.id, false, bet);
        desc = `🏆 **${winnerUser.username} wins!** +**${bet.toLocaleString()}** ${config.currency}!`;
        color = config.colors.success;
      }

      const newBal = getUser(message.author.id).balance;
      const embed = new EmbedBuilder().setColor(color).setTitle('❌ Tic Tac Toe')
        .setDescription([desc, `💰 ${message.author.username}'s balance: **${newBal.toLocaleString()}** ${config.currency}`].join('\n')).setTimestamp();
      await updateFn({ embeds: [embed], components: buildRows(board, true) }).catch(() => {});
    }

    collector.on('collect', async i => {
      const idx = parseInt(i.customId.replace('ttt_', ''));
      if (board[idx]) return i.deferUpdate();

      board[idx] = currentPlayer.id === message.author.id ? 'X' : 'O';
      await i.deferUpdate();

      const winner = checkWinner(board);
      if (winner || !board.includes(null)) {
        await reply.edit({ components: buildRows(board) }).catch(() => {});
        return finishGame(winner, fn => reply.edit(fn));
      }

      if (vsAI) {
        // AI move immediately
        await reply.edit({ embeds: [buildEmbed('🤖 AI thinking...')], components: buildRows(board, true) }).catch(() => {});
        await new Promise(r => setTimeout(r, 700));
        const aiMove = bestMove(board);
        board[aiMove] = 'O';
        const aiWinner = checkWinner(board);
        if (aiWinner || !board.includes(null)) {
          return finishGame(aiWinner, fn => reply.edit(fn));
        }
        await reply.edit({ embeds: [buildEmbed()], components: buildRows(board) }).catch(() => {});
      } else {
        currentPlayer = currentPlayer.id === message.author.id ? opponent : message.author;
        await reply.edit({ embeds: [buildEmbed()], components: buildRows(board) }).catch(() => {});
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time' && !gameOver) {
        client.activeGames.delete(gameKey);
        addBalance(message.author.id, bet);
        if (!vsAI) addBalance(opponent.id, bet);
        reply.edit({ content: '⏰ Game timed out. Bets returned.', components: [] }).catch(() => {});
      }
    });
  },
};
