const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame, getActivePool } = require('../../utils/database');
const { parseBet, tiePayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

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
  description: 'Tic Tac Toe — PvP only! Challenge another player.',
  usage: '.ttt <bet|all|half> @user',
  guildOnly: true,
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.reply({ embeds: [errorEmbed('PvP Only', 'Tic Tac Toe is PvP only — mention an opponent!\n`Usage: .ttt <bet> @user`')] });
    }

    const oppPool = getActivePool(opponent.id);
    if (oppPool.amount < bet) {
      return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough ${config.currency}.`)] });
    }

    const oppIsDemo = oppPool.isDemo;
    const gameKey = `ttt_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current TTT!')] });

    // Accept challenge
    const challengeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ttt_accept').setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ttt_decline').setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
    );
    const challengeEmbed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('❌⭕ TTT Challenge')
      .setDescription([
        `${message.author} challenged ${opponent} to **Tic Tac Toe**!`,
        `Bet: **${fmtR(bet)}** ${config.currency} each`,
        `${opponent.username}, click **Accept**!`,
      ].join('\n'))
      .setTimestamp();
    const challengeMsg = await message.reply({ embeds: [challengeEmbed], components: [challengeRow] });

    const acceptCollector = challengeMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === opponent.id,
      time: 30000, max: 1,
    });

    acceptCollector.on('collect', async i => {
      if (i.customId === 'ttt_decline') {
        await i.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('TTT Declined').setDescription(`${opponent.username} declined.`).setTimestamp()], components: [] });
        return;
      }
      await i.deferUpdate();

      spendBet(message.author.id, bet, isDemo);
      spendBet(opponent.id, bet, oppIsDemo);
      client.activeGames.set(gameKey, { name: 'Tic Tac Toe', userId: message.author.id, bet });

      const board = Array(9).fill(null);
      let currentPlayer = message.author;
      let gameOver = false;

      const buildEmbed = (status = '') => new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`❌⭕ Tic Tac Toe${balLabel(isDemo)}`)
        .setDescription([
          `**${message.author.username} (✖) vs ${opponent.username} (⭕)**`,
          status || `${currentPlayer.username}'s turn (${currentPlayer.id === message.author.id ? '✖' : '⭕'})`,
        ].join('\n'))
        .setTimestamp();

      await challengeMsg.edit({ embeds: [buildEmbed()], components: buildRows(board) });

      const collector = challengeMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === currentPlayer.id && i.customId.startsWith('ttt_'),
        time: 120000,
      });

      async function endGame(winner) {
        gameOver = true; client.activeGames.delete(gameKey); collector.stop();
        let desc, color;
        const pot = bet * 2;
        if (!winner) {
          const push = tiePayout(bet);
          addWin(message.author.id, push, isDemo);
          addWin(opponent.id, push, oppIsDemo);
          desc = `🤝 **Draw!** Each player gets back **${fmtR(push)}** ${config.currency} (house took 4%).`;
          color = config.colors.warning;
        } else if (winner === 'X') {
          addWin(message.author.id, pot, isDemo);
          recordGame(message.author.id, true, bet);
          recordGame(opponent.id, false, bet);
          desc = `🏆 **${message.author.username} wins!** +**${fmtR(bet)}** ${config.currency}!`;
          color = config.colors.success;
        } else {
          addWin(opponent.id, pot, oppIsDemo);
          recordGame(opponent.id, true, bet);
          recordGame(message.author.id, false, bet);
          desc = `🏆 **${opponent.username} wins!** +**${fmtR(bet)}** ${config.currency}!`;
          color = config.colors.success;
        }
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        const embed = new EmbedBuilder().setColor(color).setTitle('❌⭕ TTT Result')
          .setDescription([desc, `💰 ${message.author.username}'s balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`].join('\n')).setTimestamp();
        await challengeMsg.edit({ embeds: [embed], components: buildRows(board, true) }).catch(() => {});
      }

      collector.on('collect', async i => {
        const idx = parseInt(i.customId.replace('ttt_', ''));
        if (isNaN(idx) || board[idx]) return i.deferUpdate();
        board[idx] = currentPlayer.id === message.author.id ? 'X' : 'O';
        await i.deferUpdate();
        const winner = checkWinner(board);
        if (winner || !board.includes(null)) {
          await challengeMsg.edit({ components: buildRows(board) }).catch(() => {});
          return endGame(winner);
        }
        currentPlayer = currentPlayer.id === message.author.id ? opponent : message.author;
        await challengeMsg.edit({ embeds: [buildEmbed()], components: buildRows(board) }).catch(() => {});
      });

      collector.on('end', (_, reason) => {
        client.activeGames.delete(gameKey);
        if (reason === 'time' && !gameOver) {
          addWin(message.author.id, bet, isDemo);
          addWin(opponent.id, bet, oppIsDemo);
          challengeMsg.edit({ content: '⏰ Game timed out. Bets returned.', components: [] }).catch(() => {});
        }
      });
    });

    acceptCollector.on('end', (_, reason) => {
      if (reason === 'time') challengeMsg.edit({ content: '⏰ Challenge expired.', components: [] }).catch(() => {});
    });
  },
};
