const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
  name: 'games',
  description: 'Shows all active games',
  usage: '.games',
  guildOnly: true,
  async execute(message, args, client) {
    const activeGames = client.activeGames || new Map();

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🎮 Active Games')
      .setTimestamp();

    if (activeGames.size === 0) {
      embed.setDescription('No active games right now.\nStart one with any game command!');
    } else {
      const lines = [];
      for (const [key, game] of activeGames.entries()) {
        const user = await message.client.users.fetch(game.userId).catch(() => null);
        const name = user ? user.tag : 'Unknown';
        lines.push(`• **${game.name}** — ${name} | Bet: **${game.bet}** ${config.currency}`);
      }
      embed.setDescription(lines.join('\n'));
      embed.setFooter({ text: `${activeGames.size} active game(s)` });
    }

    const allGames = [
      '🃏 baccarat', '🎈 balloon', '🂡 bj (blackjack)', '🎲 bjdice',
      '🃏 cards', '📦 casebattles', '🎰 slots', '🪙 cf (coinflip)',
      '🔴 connect', '📈 crash', '🎲 dice', '⚔️ fight',
      '👻 ghosts', '🃏 hilo', '📊 limbo', '🏪 market',
      '💣 mines', '🎯 plinko', '✊ rps', '🎡 roulette', '❌ ttt'
    ];

    embed.addFields({ name: '🎯 Available Games', value: allGames.join(' · ') });

    message.reply({ embeds: [embed] });
  },
};
