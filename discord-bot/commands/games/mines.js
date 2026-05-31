const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const GRID = 5;
const TOTAL = GRID * GRID;

function calcMultiplier(revealed, mines) {
  const safe = TOTAL - mines;
  let mult = 1.0;
  for (let i = 0; i < revealed; i++) {
    mult *= (TOTAL - mines - i) / (TOTAL - i);
  }
  return parseFloat((0.97 / mult).toFixed(2));
}

module.exports = {
  name: 'mines',
  description: 'Minesweeper — reveal gems without hitting mines!',
  usage: '.mines <bet> <mines 1-24>',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .mines <bet> <mines>`')] });

    const mineCount = parseInt(args[1]) || 3;
    if (mineCount < 1 || mineCount > 24) return message.reply({ embeds: [errorEmbed('Invalid Mines', 'Mine count must be between 1 and 24.')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `mines_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current mines game first!')] });

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'Mines', userId: message.author.id, bet });

    // Place mines randomly
    const cells = Array(TOTAL).fill(false);
    let placed = 0;
    while (placed < mineCount) {
      const idx = Math.floor(Math.random() * TOTAL);
      if (!cells[idx]) { cells[idx] = true; placed++; }
    }

    const revealed = Array(TOTAL).fill(null); // null=hidden, 'gem', 'mine'
    let revealedCount = 0;
    let gameOver = false;

    const buildRows = (showAll = false) => {
      const rows = [];
      for (let r = 0; r < GRID; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < GRID; c++) {
          const idx = r * GRID + c;
          const state = revealed[idx];
          let emoji = '⬜', style = ButtonStyle.Secondary, disabled = false;
          if (state === 'gem') { emoji = '💎'; style = ButtonStyle.Success; disabled = true; }
          else if (state === 'mine') { emoji = '💣'; style = ButtonStyle.Danger; disabled = true; }
          else if (showAll && cells[idx]) { emoji = '💣'; style = ButtonStyle.Danger; disabled = true; }
          else if (gameOver) disabled = true;
          row.addComponents(
            new ButtonBuilder().setCustomId(`mine_${idx}`).setLabel(emoji).setStyle(style).setDisabled(disabled)
          );
        }
        rows.push(row);
      }
      const cashRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mine_cashout').setLabel(`💰 Cash Out (${calcMultiplier(revealedCount, mineCount)}x)`).setStyle(ButtonStyle.Primary).setDisabled(revealedCount === 0 || gameOver)
      );
      rows.push(cashRow);
      return rows;
    };

    const buildEmbed = (status = '') => new EmbedBuilder()
      .setColor(gameOver ? (revealed.some(r => r === 'mine') ? config.colors.error : config.colors.success) : config.colors.primary)
      .setTitle('💣 Mines')
      .setDescription([
        `Bet: **${bet.toLocaleString()}** ${config.currency} | Mines: **${mineCount}**`,
        `Gems found: **${revealedCount}** | Multiplier: **${calcMultiplier(revealedCount, mineCount)}x**`,
        status ? `\n${status}` : '',
      ].join('\n'))
      .setTimestamp();

    const reply = await message.reply({ embeds: [buildEmbed()], components: buildRows() });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'mine_cashout') {
        const mult = calcMultiplier(revealedCount, mineCount);
        const winnings = Math.floor(bet * mult);
        addBalance(message.author.id, winnings);
        recordGame(message.author.id, true, winnings - bet);
        const newBal = getUser(message.author.id).balance;
        gameOver = true;
        collector.stop();
        await i.update({
          embeds: [buildEmbed(`💰 Cashed out at **${mult}x** → Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`)],
          components: buildRows(true),
        }).catch(() => {});
        client.activeGames.delete(gameKey);
        return;
      }

      const idx = parseInt(i.customId.replace('mine_', ''));
      if (isNaN(idx) || revealed[idx] !== null) return i.deferUpdate();

      if (cells[idx]) {
        // Hit mine
        revealed[idx] = 'mine';
        gameOver = true;
        recordGame(message.author.id, false, bet);
        const newBal = getUser(message.author.id).balance;
        collector.stop();
        await i.update({
          embeds: [buildEmbed(`💥 Hit a mine! Lost **${bet.toLocaleString()}** ${config.currency}.\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`)],
          components: buildRows(true),
        }).catch(() => {});
        client.activeGames.delete(gameKey);
      } else {
        revealed[idx] = 'gem';
        revealedCount++;
        if (revealedCount === TOTAL - mineCount) {
          // Auto-win all gems
          const mult = calcMultiplier(revealedCount, mineCount);
          const winnings = Math.floor(bet * mult);
          addBalance(message.author.id, winnings);
          recordGame(message.author.id, true, winnings - bet);
          gameOver = true;
          collector.stop();
          await i.update({
            embeds: [buildEmbed(`🎉 Found all gems! Won **${winnings.toLocaleString()}** ${config.currency}!`)],
            components: buildRows(true),
          }).catch(() => {});
          client.activeGames.delete(gameKey);
        } else {
          await i.update({ embeds: [buildEmbed()], components: buildRows() }).catch(() => {});
        }
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        // Auto-cashout on timeout
        if (revealedCount > 0) {
          const mult = calcMultiplier(revealedCount, mineCount);
          addBalance(message.author.id, Math.floor(bet * mult));
        }
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
