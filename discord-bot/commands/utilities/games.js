const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
  name: 'games',
  description: 'Shows all active games and available games list',
  usage: '.games',
  guildOnly: true,
  async execute(message, args, client) {
    const activeGames = client.activeGames || new Map();

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🎮 Casino Games')
      .setTimestamp();

    if (activeGames.size === 0) {
      embed.setDescription('No active games right now.\nStart one with any game command!');
    } else {
      const lines = [];
      for (const [key, game] of activeGames.entries()) {
        const user = await message.client.users.fetch(game.userId).catch(() => null);
        const name = user ? user.tag : 'Unknown';
        lines.push(`• **${game.name}** — ${name} | Bet: **${game.bet.toLocaleString()}** ${config.currency}`);
      }
      embed.setDescription(lines.join('\n'));
      embed.setFooter({ text: `${activeGames.size} active game(s)` });
    }

    const solo = [
      '🃏 baccarat', '🂡 bj', '🃏 cards',
      '📈 crash', '🎲 dice', '🎡 roulette',
    ];
    const pvp = ['📦 casebattles', '🪙 cf', '⚔️ fight', '✊ rps', '❌ ttt'];

    embed.addFields(
      { name: '🎮 Solo Games', value: solo.join(' · '), inline: false },
      { name: '👥 PvP Games (require @user)', value: pvp.join(' · '), inline: false },
      { name: '⏳ Tip', value: 'Bets support `all` and `half`. Most games have interactive bet selection.', inline: false },
    );

    message.reply({ embeds: [embed] });
  },
};
