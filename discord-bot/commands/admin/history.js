const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { errorEmbed } = require('../../utils/embeds');
const { fmtR } = require('../../utils/gameUtils');
const config = require('../../config');
const fs = require('fs');
const path = require('path');

const GAMES_PATH = path.join(__dirname, '../../data/games.json');
const PAGE_SIZE = 10;

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

function buildPage(records, page, target) {
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const slice = records.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const lines = slice.map((g, i) => {
    const num     = page * PAGE_SIZE + i + 1;
    const icon    = resultIcon(g.outcome);
    const ts      = `<t:${Math.floor(g.timestamp / 1000)}:d>`;
    const bet     = g.inputs?.bet ?? '?';
    const result  = (g.outcome?.result ?? 'unknown').toUpperCase();
    const detail  = getDetail(g);
    return `\`${String(num).padStart(3, ' ')}\` ${icon} **${g.type.toUpperCase()}** — ${ts}\n      ${detail}`;
  });

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`📋 Game History — ${target.username}`)
    .setDescription(lines.join('\n') || '*No games found.*')
    .setFooter({ text: `Page ${page + 1}/${totalPages} · ${records.length} total games` })
    .setTimestamp();
}

function getDetail(g) {
  const out = g.outcome || {};
  switch (g.type) {
    case 'dice':      return `Rolled **${out.roll ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'coinflip':  return `${out.side ?? '?'} → ${out.result?.toUpperCase()}`;
    case 'crash':     return `Crash @ **${out.crashPoint ?? '?'}x** | CashedAt: **${g.inputs?.cashedOutAt ?? 'No'}** → ${out.result?.toUpperCase()}`;
    case 'mines':     return `${out.result === 'lose' ? `💥 Mine hit` : `💰 Cashed out`} after **${(g.inputs?.revealed ?? []).length}** tiles → ${out.result?.toUpperCase()}`;
    case 'hilo':      return `Streak: **${(g.inputs?.actions ?? []).length}** → ${out.result?.toUpperCase()}`;
    case 'blackjack': return `Player **${out.playerScore ?? '?'}** vs Dealer **${out.dealerScore ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'baccarat':  return `P **${out.pVal ?? '?'}** vs B **${out.bVal ?? '?'}** | Winner: **${out.winner?.toUpperCase() ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'roulette':  return `Ball landed **${out.number ?? '?'}** → ${out.result?.toUpperCase()}`;
    case 'cards':     return `Card: **${out.card ?? '?'}** → ${out.result?.toUpperCase()}`;
    default:          return `${out.result?.toUpperCase() ?? 'UNKNOWN'}`;
  }
}

module.exports = {
  name: 'history',
  description: '(Admin) View full game history for a user',
  usage: '.history @user',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Usage', '`.history @user`')] });

    const allGames = loadGames();
    const records  = Object.values(allGames)
      .filter(g => g.userId === target.id)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (records.length === 0) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary)
        .setTitle(`📋 Game History — ${target.username}`)
        .setDescription('No games found for this user.')
        .setTimestamp()] });
    }

    const totalPages = Math.ceil(records.length / PAGE_SIZE);
    let page = 0;

    const buildRow = (p) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hist_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
      new ButtonBuilder().setCustomId('hist_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(p >= totalPages - 1),
    );

    const reply = await message.reply({ embeds: [buildPage(records, page, target)], components: totalPages > 1 ? [buildRow(page)] : [] });

    if (totalPages <= 1) return;

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'hist_prev') page = Math.max(0, page - 1);
      if (i.customId === 'hist_next') page = Math.min(totalPages - 1, page + 1);
      await i.update({ embeds: [buildPage(records, page, target)], components: [buildRow(page)] });
    });

    collector.on('end', () => reply.edit({ components: [] }).catch(() => {}));
  },
};
