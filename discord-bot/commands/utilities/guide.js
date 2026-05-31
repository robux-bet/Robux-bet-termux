const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../config');

const PAGES = [
  {
    title: '👋 Welcome to the Casino!',
    color: 0x5865F2,
    description: [
      `This is a virtual **Robux** gambling bot — all currency is fictional and not associated with Roblox.`,
      ``,
      `**Step 1 — Get your free Demo Balance:**`,
      `> Run \`.demo\` to receive **1,000 free Demo Robux**`,
      `> Demo Robux let you try every game`,
      `> Max bet in demo: **100 Robux per game**`,
      ``,
      `**Step 2 — Get actual Robux:**`,
      `> Open a deposit ticket with \`.deposit <amount>\``,
      `> An admin will review and credit your account`,
      `> Actual Robux have no bet limits`,
      ``,
      `*Use the buttons below to navigate this guide →*`,
    ].join('\n'),
  },
  {
    title: '💰 Balance & Economy',
    color: 0xF1C40F,
    description: [
      `**Checking your balance:**`,
      `> \`.balance\` or \`.bal\` — wallet + vault`,
      ``,
      `**Making money:**`,
      `> \`.daily\` — spin the wheel for 1–10 free Robux (24h cooldown)`,
      `> \`.tip @user <amount>\` — send Robux to a friend`,
      ``,
      `**Deposits & Withdrawals:**`,
      `> \`.deposit <amount>\` — open a deposit ticket (admin approved)`,
      `> \`.withdraw <amount>\` — open a withdrawal ticket (admin approved)`,
      ``,
      `**Vault (safe storage):**`,
      `> Ask an admin to adjust your vault with \`.adminvault\``,
    ].join('\n'),
  },
  {
    title: '🎮 Available Games',
    color: 0x57F287,
    description: [
      `**Coin & Cards:**`,
      `> \`.cf <bet>\` — Coinflip (heads or tails)`,
      `> \`.bj <bet>\` — Blackjack vs dealer`,
      `> \`.baccarat <bet>\` — Player / Banker / Tie`,
      `> \`.cards <bet>\` — Guess card color or suit`,
      `> \`.hilo <bet>\` — Higher or Lower`,
      ``,
      `**Crash & Risk:**`,
      `> \`.crash <bet>\` — Cash out before it crashes!`,
      `> \`.balloon <bet>\` — Pump before it pops!`,
      `> \`.mines <bet> <mines>\` — Minesweeper gambling`,
      ``,
      `**PvP Games (need @user):**`,
      `> \`.rps <bet> @user\` — Rock Paper Scissors`,
      `> \`.ttt <bet> @user\` — Tic Tac Toe`,
      `> \`.fight <bet> @user\` — Turn-based combat`,
      `> \`.casebattles <bet> @user\` — Case opening battle`,
      ``,
      `**Other:**`,
      `> \`.dice <bet>\` \`.roulette <bet>\` \`.plinko <bet>\``,
      ``,
      `*All bets support \`all\` and \`half\` — e.g. \`.cf all\`*`,
    ].join('\n'),
  },
  {
    title: '🔧 Useful Commands',
    color: 0xED4245,
    description: [
      `**Utilities:**`,
      `> \`.ping\` — Bot latency and uptime`,
      `> \`.games\` — See all currently active games`,
      `> \`.seed [newseed]\` — Change your provably fair seed`,
      `> \`.room create\` — Open a private thread`,
      ``,
      `**Help:**`,
      `> \`.help\` — Full command list with category buttons`,
      `> \`.guide\` — This guide`,
      ``,
      `**Tips:**`,
      `• Use \`all\` or \`half\` for bet amounts`,
      `• Demo balance is for practice only`,
      `• PvP games require \`@mentioning\` an opponent`,
      `• All games are provably fair`,
    ].join('\n'),
  },
];

module.exports = {
  name: 'guide',
  description: 'New user guide — how to get started',
  usage: '.guide',
  async execute(message) {
    let page = 0;

    const buildEmbed = () => new EmbedBuilder()
      .setColor(PAGES[page].color)
      .setTitle(PAGES[page].title)
      .setDescription(PAGES[page].description)
      .setFooter({ text: `Page ${page + 1} of ${PAGES.length} • ${config.prefix}guide` })
      .setTimestamp();

    const buildRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guide_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('guide_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page === PAGES.length - 1),
    );

    const reply = await message.reply({ embeds: [buildEmbed()], components: [buildRow()] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'guide_next') page = Math.min(page + 1, PAGES.length - 1);
      else page = Math.max(page - 1, 0);
      await i.update({ embeds: [buildEmbed()], components: [buildRow()] });
    });

    collector.on('end', () => reply.edit({ components: [] }).catch(() => {}));
  },
};
