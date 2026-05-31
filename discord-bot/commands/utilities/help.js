const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../config');

const categories = {
  admin: {
    emoji: '🛡️',
    label: 'Admin',
    description: 'Server administration commands',
    commands: [
      { name: '.add @user <amount>', desc: 'Add Robux to a user' },
      { name: '.adminvault @user <action> <amount>', desc: 'Manage vault balance' },
      { name: '.remove @user <amount>', desc: 'Remove Robux from a user' },
      { name: '.setbalance @user <amount>', desc: "Set user's balance" },
    ],
  },
  utilities: {
    emoji: '🔧',
    label: 'Utilities',
    description: 'General utility commands',
    commands: [
      { name: '.games', desc: 'Show all active games' },
      { name: '.help', desc: 'Shows this help menu' },
      { name: '.ping', desc: 'Show latency and uptime' },
      { name: '.seed [newseed]', desc: 'View/change provably fair seed' },
      { name: '.room [create|add|remove|close]', desc: 'Manage private threads' },
    ],
  },
  balance: {
    emoji: '💰',
    label: 'Balance',
    description: 'Economy and balance commands',
    commands: [
      { name: '.balance / .bal [@user]', desc: 'Check balance' },
      { name: '.daily', desc: 'Spin wheel for 1–10 Robux' },
      { name: '.deposit / .depo <amount>', desc: 'Open a deposit ticket' },
      { name: '.withdraw <amount>', desc: 'Open a withdraw ticket' },
      { name: '.tip @user <amount>', desc: 'Tip another user' },
    ],
  },
  games: {
    emoji: '🎮',
    label: 'Games',
    description: 'Gambling and game commands',
    commands: [
      { name: '.baccarat <bet>', desc: 'Baccarat card game' },
      { name: '.balloon <bet>', desc: 'Pump the balloon without popping' },
      { name: '.bj <bet>', desc: 'Blackjack vs dealer' },
      { name: '.bjdice <bet>', desc: 'Dice blackjack variant' },
      { name: '.cards <bet>', desc: 'Guess the card color' },
      { name: '.casebattles <bet>', desc: 'Open cases and battle' },
      { name: '.slots <bet>', desc: 'Spin the slot machine' },
      { name: '.cf <bet> [h|t]', desc: 'Coinflip vs house or player' },
      { name: '.connect <bet> [@user]', desc: 'Connect 4 vs AI or player' },
      { name: '.crash <bet>', desc: 'Crash multiplier game' },
      { name: '.dice <bet> <target>', desc: 'Roll dice, pick target' },
      { name: '.fight <bet> [@user]', desc: 'Fight vs another user' },
      { name: '.ghosts <bet>', desc: 'Catch good ghosts, avoid bad' },
      { name: '.hilo <bet>', desc: 'Higher or lower card game' },
      { name: '.limbo <bet> <multiplier>', desc: 'Bet on a multiplier' },
      { name: '.market', desc: 'Virtual item marketplace' },
      { name: '.mines <bet> <mines>', desc: 'Minesweeper gambling' },
      { name: '.plinko <bet> <rows>', desc: 'Plinko board drop' },
      { name: '.rps <bet> [r|p|s] [@user]', desc: 'Rock Paper Scissors' },
      { name: '.roulette <bet> <color/num>', desc: 'Roulette wheel' },
      { name: '.ttt <bet> [@user]', desc: 'Tic Tac Toe vs AI or player' },
    ],
  },
};

function buildEmbed(catKey) {
  const cat = categories[catKey];
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${cat.emoji} ${cat.label} Commands`)
    .setDescription(cat.description)
    .addFields(
      cat.commands.map(c => ({ name: `\`${c.name}\``, value: c.desc, inline: false }))
    )
    .setFooter({ text: `${config.prefix}help • Virtual Robux Casino` })
    .setTimestamp();
  return embed;
}

function buildButtons(activeKey) {
  const row = new ActionRowBuilder();
  for (const [key, cat] of Object.entries(categories)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`help_${key}`)
        .setLabel(`${cat.emoji} ${cat.label}`)
        .setStyle(activeKey === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }
  return row;
}

module.exports = {
  name: 'help',
  description: 'Show all available commands',
  usage: '.help [category]',
  async execute(message, args) {
    let currentCat = args[0]?.toLowerCase();
    if (!categories[currentCat]) currentCat = 'utilities';

    const embed = buildEmbed(currentCat);
    const row = buildButtons(currentCat);

    const reply = await message.reply({ embeds: [embed], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      const catKey = i.customId.replace('help_', '');
      currentCat = catKey;
      await i.update({ embeds: [buildEmbed(catKey)], components: [buildButtons(catKey)] });
    });

    collector.on('end', () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};
