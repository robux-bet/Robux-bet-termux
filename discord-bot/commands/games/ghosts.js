const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const GHOST_TYPES = [
  { emoji: '👻', type: 'good', label: 'Friendly Ghost', mult: 0.3 },
  { emoji: '💀', type: 'bad',  label: 'Evil Skull', mult: -1 },
  { emoji: '😊', type: 'good', label: 'Happy Ghost', mult: 0.5 },
  { emoji: '🕷️', type: 'bad',  label: 'Spider', mult: -0.5 },
  { emoji: '⭐', type: 'good', label: 'Star Ghost', mult: 1 },
  { emoji: '🔮', type: 'good', label: 'Magic Orb', mult: 0.7 },
  { emoji: '🦇', type: 'bad',  label: 'Vampire Bat', mult: -0.8 },
  { emoji: '🌟', type: 'jackpot', label: 'Golden Ghost', mult: 3 },
];

const GRID_SIZE = 9;

module.exports = {
  name: 'ghosts',
  description: 'Catch good ghosts, avoid evil ones! Pick 3 ghosts.',
  usage: '.ghosts <bet>',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .ghosts <bet>`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `ghosts_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current ghost game!')] });

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'Ghosts', userId: message.author.id, bet });

    // Generate a 3x3 grid of hidden ghosts
    const ghosts = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      ghosts.push(GHOST_TYPES[Math.floor(Math.random() * GHOST_TYPES.length)]);
    }

    const revealed = Array(GRID_SIZE).fill(false);
    let picks = 0;
    const MAX_PICKS = 3;
    let totalMult = 0;
    let gameOver = false;
    const log = [];

    const buildGrid = (showAll = false) => {
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
          const idx = r * 3 + c;
          const isRevealed = revealed[idx];
          const ghost = ghosts[idx];
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`ghost_${idx}`)
              .setLabel(isRevealed || showAll ? ghost.emoji : '🌫️')
              .setStyle(isRevealed || showAll
                ? ghost.type === 'good' || ghost.type === 'jackpot' ? ButtonStyle.Success : ButtonStyle.Danger
                : ButtonStyle.Secondary)
              .setDisabled(isRevealed || gameOver || picks >= MAX_PICKS)
          );
        }
        rows.push(row);
      }
      return rows;
    };

    const buildEmbed = () => new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('👻 Ghost Hunt')
      .setDescription([
        `Pick **${MAX_PICKS - picks}** more ghost${MAX_PICKS - picks !== 1 ? 's' : ''}! (${picks}/${MAX_PICKS} picked)`,
        `Current multiplier: **${(1 + totalMult).toFixed(2)}x** → **${Math.floor(bet * Math.max(0, 1 + totalMult)).toLocaleString()}** ${config.currency}`,
        log.length ? `\n**Log:**\n${log.slice(-3).join('\n')}` : '',
      ].join('\n'))
      .setTimestamp();

    const reply = await message.reply({ embeds: [buildEmbed()], components: buildGrid() });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      const idx = parseInt(i.customId.replace('ghost_', ''));
      if (revealed[idx] || picks >= MAX_PICKS) return i.deferUpdate();

      revealed[idx] = true;
      picks++;
      const ghost = ghosts[idx];
      totalMult += ghost.mult;
      log.push(`${ghost.emoji} **${ghost.label}**: ${ghost.mult >= 0 ? '+' : ''}${ghost.mult}x`);

      if (picks >= MAX_PICKS) {
        gameOver = true;
        collector.stop('done');
        const finalMult = Math.max(0, 1 + totalMult);
        const winnings = Math.floor(bet * finalMult);
        if (winnings > 0) addBalance(message.author.id, winnings);
        recordGame(message.author.id, winnings > bet, winnings > bet ? winnings - bet : bet - winnings);
        const newBal = getUser(message.author.id).balance;
        client.activeGames.delete(gameKey);

        const embed = new EmbedBuilder()
          .setColor(winnings >= bet ? config.colors.success : config.colors.error)
          .setTitle('👻 Ghost Hunt Result')
          .setDescription([
            `**All ghosts revealed!**`,
            `Final multiplier: **${finalMult.toFixed(2)}x**`,
            '',
            winnings >= bet
              ? `🎉 Won **${winnings.toLocaleString()}** ${config.currency}! (+${(winnings - bet).toLocaleString()})`
              : winnings > 0
              ? `😢 Got back **${winnings.toLocaleString()}** ${config.currency}.`
              : `💀 All evil! Lost everything!`,
            `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
            `\n**Picks:**\n${log.join('\n')}`,
          ].join('\n'))
          .setTimestamp();

        await i.update({ embeds: [embed], components: buildGrid(true) }).catch(() => {});
      } else {
        await i.update({ embeds: [buildEmbed()], components: buildGrid() }).catch(() => {});
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        addBalance(message.author.id, bet);
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
