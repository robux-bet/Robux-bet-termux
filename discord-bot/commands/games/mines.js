const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

// 4x4 grid = 16 cells → 4 rows of buttons + 1 cashout = 5 rows (Discord max)
const GRID = 4;
const TOTAL = GRID * GRID; // 16

function calcMultiplier(revealed, mines) {
  const safe = TOTAL - mines;
  let mult = 1.0;
  for (let i = 0; i < revealed; i++) {
    mult *= (safe - i) / (TOTAL - i);
  }
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

    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'Mines', userId: message.author.id, bet });

    // Place mines
    const isMine = Array(TOTAL).fill(false);
    let placed = 0;
    while (placed < mineCount) {
      const idx = Math.floor(Math.random() * TOTAL);
      if (!isMine[idx]) { isMine[idx] = true; placed++; }
    }

    const state = Array(TOTAL).fill(null); // null | 'gem' | 'mine'
    let revealed = 0;
    let gameOver = false;

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
        `Bet: **${bet.toLocaleString()}** ${config.currency} | Mines: **${mineCount}** | Gems found: **${revealed}**`,
        status,
      ].filter(Boolean).join('\n'))
      .setTimestamp();

    const reply = await message.reply({ embeds: [buildEmbed()], components: buildRows() });

    const collector = reply.createMessageComponentCollector({
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
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);
        await i.update({
          embeds: [buildEmbed(`💰 Cashed out at **${mult}x**! Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`)],
          components: buildRows(true),
        }).catch(() => {});
        return;
      }

      const idx = parseInt(i.customId.replace('mine_', ''));
      if (isNaN(idx) || state[idx] !== null) return i.deferUpdate();

      if (isMine[idx]) {
        state[idx] = 'mine';
        gameOver = true; collector.stop(); client.activeGames.delete(gameKey);
        recordGame(message.author.id, false, bet);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        await i.update({
          embeds: [buildEmbed(`💥 Hit a mine! Lost **${bet.toLocaleString()}** ${config.currency}.\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`)],
          components: buildRows(true),
        }).catch(() => {});
      } else {
        state[idx] = 'gem';
        revealed++;
        if (revealed === TOTAL - mineCount) {
          const mult = calcMultiplier(revealed, mineCount);
          const winnings = calcPayout(bet, mult, true);
          addWin(message.author.id, winnings, isDemo);
          recordGame(message.author.id, true, winnings - bet);
          gameOver = true; collector.stop(); client.activeGames.delete(gameKey);
          const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
          await i.update({
            embeds: [buildEmbed(`🎉 All gems found! Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`)],
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
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
