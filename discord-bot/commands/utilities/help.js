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
      { name: '.ayowtf', desc: '🎮 Force next game outcome (WIN/LOSE/FAIR)' },
      { name: '.userinfo @user', desc: '📋 Full user info (balances, honeymoon, status)' },
      { name: '.resetwager @user', desc: '🧹 Clear wager requirement' },
      { name: '.resetdemo @user', desc: '🎁 Reset demo claim' },
      { name: '.lockuser @user', desc: '🔒 Lock user from gambling' },
      { name: '.unlockuser @user', desc: '🔓 Unlock user' },
      { name: '.cleargames', desc: '🧹 Force-clear all stuck active games' },
      { name: '.broadcast <message>', desc: '📡 DM all users an announcement' },
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
      { name: '.games', desc: 'See all active games and game list' },
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
      { name: '.deposit <amount>', desc: 'Open a deposit ticket (pings admin)' },
      { name: '.withdraw <amount>', desc: 'Open a withdrawal ticket (pings admin)' },
      { name: '.tip @user <amount>', desc: 'Send Robux to another user' },
    ],
  },
  games: {
    emoji: '🎮',
    label: 'Games',
    description: 'Every game has a **5-second loading screen**. Bets support `all` and `half`.',
    commands: [
      { name: '.baccarat <bet> [p|b]', desc: 'Player vs Banker card game (2x)' },
      { name: '.bj <bet>', desc: 'Blackjack vs dealer (2x)' },
      { name: '.cards <bet>', desc: 'Guess card color (2x) or suit (3–4x)' },
      { name: '.casebattles <bet> @user', desc: 'PvP case opening battle' },
      { name: '.cf <bet> [h|t]', desc: 'Coinflip (2x)' },
      { name: '.crash <bet>', desc: 'Cash out before it crashes — admin can set crash point' },
      { name: '.dice <bet> <high|low>', desc: 'High (4–6) or Low (1–3) dice (2x)' },
      { name: '.fight <bet> [@user]', desc: 'Turn-based combat' },
      { name: '.hilo <bet>', desc: 'Higher or Lower — up to 8 streaks (hard mode)' },
      { name: '.market [buy|sell|inventory|info]', desc: 'Casino cosmetics shop' },
      { name: '.mines <bet> [mines]', desc: 'Minesweeper — admin can set safe tile limit' },
      { name: '.roulette <bet> <target>', desc: 'Roulette: color/even/odd 2x · green 5x' },
      { name: '.rps <bet> @user', desc: 'Rock Paper Scissors (PvP)' },
      { name: '.ttt <bet> @user', desc: 'Tic Tac Toe (PvP)' },
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
