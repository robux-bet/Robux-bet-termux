const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../config');

const categories = {
  admin: {
    emoji: '🛡️',
    label: 'Admin',
    description: 'Server administration commands (requires Admin role)',
    commands: [
      { name: '.add @user <amount>', desc: 'Add actual Robux to a user' },
      { name: '.remove @user <amount>', desc: 'Remove Robux from a user' },
      { name: '.setbalance @user <amount>', desc: "Set user's actual balance" },
      { name: '.adminvault @user <set|add|remove|view> <amt>', desc: 'Manage vault balance' },
      { name: '.ayowtf', desc: '🎮 Force next game outcome for any user (WIN/LOSE/FAIR)' },
      { name: '.userinfo @user', desc: '📋 View full user info (balances, status, honeymoon)' },
      { name: '.resetwager @user', desc: '🧹 Clear a user\'s wager requirement' },
      { name: '.resetdemo @user', desc: '🎁 Reset a user\'s demo claim so they can use .demo again' },
      { name: '.lockuser @user', desc: '🔒 Lock a user from gambling' },
      { name: '.unlockuser @user', desc: '🔓 Unlock a user so they can gamble again' },
      { name: '.cleargames', desc: '🧹 Force-clear all stuck active games' },
    ],
  },
  utilities: {
    emoji: '🔧',
    label: 'Utilities',
    description: 'General utility commands',
    commands: [
      { name: '.guide', desc: '📖 New user guide — start here!' },
      { name: '.help [category]', desc: 'Shows this help menu' },
      { name: '.ping', desc: 'Show latency and uptime' },
      { name: '.games', desc: 'See all active games and available games list' },
      { name: '.seed [newseed]', desc: 'View/change provably fair seed' },
      { name: '.room create|add|remove|close', desc: 'Private thread management' },
    ],
  },
  balance: {
    emoji: '💰',
    label: 'Balance',
    description: 'Economy and balance commands',
    commands: [
      { name: '.demo', desc: '🎁 Claim 1,000 free demo Robux (once)' },
      { name: '.balance / .bal [@user]', desc: 'Check wallet, demo & vault' },
      { name: '.daily', desc: 'Spin wheel for 1–10 free Robux (24h)' },
      { name: '.deposit <amount>', desc: 'Open a deposit ticket channel (pings admin)' },
      { name: '.withdraw <amount>', desc: 'Open a withdrawal ticket channel (pings admin)' },
      { name: '.tip @user <amount>', desc: 'Send Robux to another user' },
    ],
  },
  games: {
    emoji: '🎮',
    label: 'Games',
    description: 'All gambling and game commands — every game has a 5s loading screen. Use `all` or `half` for bets!',
    commands: [
      { name: '.baccarat <bet> [p|b|t]', desc: 'Player / Banker / Tie card game' },
      { name: '.balloon <bet>', desc: 'Pump balloon, cash out before pop' },
      { name: '.bj <bet>', desc: 'Blackjack vs dealer' },
      { name: '.cards <bet>', desc: 'Guess card color or suit' },
      { name: '.casebattles <bet> @user', desc: 'PvP case opening battle' },
      { name: '.cf <bet> [h|t]', desc: 'Coinflip (heads or tails)' },
      { name: '.crash <bet>', desc: 'Cash out before it crashes!' },
      { name: '.dice <bet> <1-6|high|low>', desc: 'Dice roll' },
      { name: '.fight <bet> [@user]', desc: 'Turn-based combat' },
      { name: '.hilo <bet>', desc: 'Higher or Lower card game' },
      { name: '.market [buy|sell|inventory|info]', desc: 'Casino cosmetics shop' },
      { name: '.mines <bet> [mines]', desc: 'Minesweeper with cash-out' },
      { name: '.plinko <bet> [8|12|16]', desc: 'Plinko board drop' },
      { name: '.roulette <bet> <target>', desc: 'Roulette wheel' },
      { name: '.rps <bet> @user', desc: 'Rock Paper Scissors (PvP only)' },
      { name: '.ttt <bet> @user', desc: 'Tic Tac Toe (PvP only)' },
    ],
  },
};

function buildEmbed(catKey) {
  const cat = categories[catKey];
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${cat.emoji} ${cat.label} Commands`)
    .setDescription(cat.description)
    .addFields(cat.commands.map(c => ({ name: `\`${c.name}\``, value: c.desc, inline: false })))
    .setFooter({ text: `${config.prefix}help • ${config.prefix}guide for new users` })
    .setTimestamp();
}

function buildButtons(activeKey) {
  return new ActionRowBuilder().addComponents(
    ...Object.entries(categories).map(([key, cat]) =>
      new ButtonBuilder()
        .setCustomId(`help_${key}`)
        .setLabel(`${cat.emoji} ${cat.label}`)
        .setStyle(activeKey === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
}

module.exports = {
  name: 'help',
  description: 'Show all commands by category',
  usage: '.help [admin|utilities|balance|games]',
  async execute(message, args) {
    let current = args[0]?.toLowerCase();
    if (!categories[current]) current = 'utilities';

    const reply = await message.reply({ embeds: [buildEmbed(current)], components: [buildButtons(current)] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      current = i.customId.replace('help_', '');
      await i.update({ embeds: [buildEmbed(current)], components: [buildButtons(current)] });
    });

    collector.on('end', () => reply.edit({ components: [] }).catch(() => {}));
  },
};
