const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../config');
const fs   = require('fs');
const path = require('path');

const GAMES_PATH = path.join(__dirname, '../../data/games.json');
const PAGE_SIZE  = 10;

function loadGames() {
  if (!fs.existsSync(GAMES_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(GAMES_PATH, 'utf8')); } catch { return {}; }
}

function resultIcon(outcome) {
  const r = outcome?.result;
  if (r === 'win') return '✅';
  if (r === 'lose') return '❌';
  return '🤝';
}

function getDetail(g) {
  const out = g.outcome || {};
  switch (g.type) {
    case 'dice':      return `Rolled **${out.roll ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'coinflip':  return `${out.side ?? '?'} → ${out.result?.toUpperCase()}`;
    case 'crash':     return `Crash @ **${out.crashPoint ?? '?'}x** | CashedAt: **${g.inputs?.cashedOutAt ?? 'No'}** → ${out.result?.toUpperCase()}`;
    case 'mines':     return `${out.result === 'lose' ? '💥 Mine hit' : '💰 Cashed'} after **${(g.inputs?.revealed ?? []).length}** tiles → ${out.result?.toUpperCase()}`;
    case 'hilo':      return `Streak: **${(g.inputs?.actions ?? []).length}** → ${out.result?.toUpperCase()}`;
    case 'blackjack': return `Player **${out.playerScore ?? '?'}** vs Dealer **${out.dealerScore ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'baccarat':  return `P **${out.pVal ?? '?'}** vs B **${out.bVal ?? '?'}** · Winner: **${out.winner?.toUpperCase() ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'roulette':  return `Ball landed **${out.number ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'cards':     return `Card: **${out.card ?? '?'}** → ${out.result?.toUpperCase()}`;
    default:          return `${out.result?.toUpperCase() ?? 'UNKNOWN'}`;
  }
}

function buildPage(records, page, target) {
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const slice = records.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const lines = slice.map((g, i) => {
    const num  = page * PAGE_SIZE + i + 1;
    const icon = resultIcon(g.outcome);
    const ts   = `<t:${Math.floor(g.timestamp / 1000)}:d>`;
    return `\`${String(num).padStart(3, ' ')}\` ${icon} **${g.type.toUpperCase()}** — ${ts}\n      ${getDetail(g)}`;
  });

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`📋 Game History — ${target.username}`)
    .setDescription(lines.join('\n') || '*No games found.*')
    .setFooter({ text: `Page ${page + 1}/${totalPages} · ${records.length} total games` })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View a user\'s full game history (admin only)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  async execute(interaction) {
    const target     = interaction.options.getUser('user');
    const allGames   = loadGames();
    const records    = Object.values(allGames)
      .filter(g => g.userId === target.id)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (records.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary)
          .setTitle(`📋 Game History — ${target.username}`)
          .setDescription('No games recorded for this user.')
          .setTimestamp()],
        ephemeral: true,
      });
    }

    const totalPages = Math.ceil(records.length / PAGE_SIZE);
    let page = 0;

    const buildRow = p => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sh_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
      new ButtonBuilder().setCustomId('sh_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(p >= totalPages - 1),
    );

    await interaction.reply({
      embeds: [buildPage(records, 0, target)],
      components: totalPages > 1 ? [buildRow(0)] : [],
      ephemeral: true,
    });

    if (totalPages <= 1) return;

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'sh_prev') page = Math.max(0, page - 1);
      if (i.customId === 'sh_next') page = Math.min(totalPages - 1, page + 1);
      await i.update({ embeds: [buildPage(records, page, target)], components: [buildRow(page)] });
    });

    collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
  },
};
