const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, saveUser } = require('../../utils/database');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const config = require('../../config');

const MARKET_ITEMS = [
  {
    id: 'vip_badge',
    name: 'VIP Badge',
    emoji: '⭐',
    price: 500,
    rarity: 'Epic',
    desc: 'Flex with a VIP tag in leaderboards and balance checks',
    perks: ['VIP tag on .balance', 'Gold name in .games', 'Priority in tickets'],
  },
  {
    id: 'diamond_crown',
    name: 'Diamond Crown',
    emoji: '👑',
    price: 1000,
    rarity: 'Legendary',
    desc: 'The ultimate status symbol in the casino',
    perks: ['Crown emoji on .balance', 'Listed as high roller', 'Royal title'],
  },
  {
    id: 'casino_card',
    name: 'Casino Card',
    emoji: '🃏',
    price: 200,
    rarity: 'Rare',
    desc: 'A sleek membership card proving you\'re a regular',
    perks: ['Card on your profile', 'Gambler\'s badge', 'Shareable flex'],
  },
  {
    id: 'golden_chip',
    name: 'Golden Chip',
    emoji: '🟡',
    price: 350,
    rarity: 'Epic',
    desc: 'The gold chip: reserved for true high rollers',
    perks: ['Gold chip display', 'High roller status', 'Rare collectible'],
  },
  {
    id: 'mystery_box',
    name: 'Mystery Box',
    emoji: '📦',
    price: 150,
    rarity: 'Common',
    desc: 'Open for a random Robux surprise (50–300)',
    perks: ['Random Robux reward on open'],
    openable: true,
  },
  {
    id: 'neon_trophy',
    name: 'Neon Trophy',
    emoji: '🏆',
    price: 750,
    rarity: 'Legendary',
    desc: 'A flashy neon trophy — the envy of the casino floor',
    perks: ['Trophy on your balance', 'Champion status', 'Neon glow flex'],
  },
];

const RARITY_COLORS = { Common: '⬜', Rare: '🟦', Epic: '🟪', Legendary: '🟨' };

module.exports = {
  name: 'market',
  aliases: ['shop', 'store'],
  description: 'Buy cosmetic items to flex with your Robux',
  usage: '.market [buy <id> | sell <id> | inventory | info <id>]',
  async execute(message, args) {
    const sub = args[0]?.toLowerCase() || 'browse';

    if (sub === 'browse' || sub === 'list') {
      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🏪 Casino Market')
        .setDescription([
          `Spend your ${config.currency} on exclusive cosmetics and flexes!`,
          `All items are **cosmetic only** — pure status and style.`,
          ``,
          `\`\`\``,
          MARKET_ITEMS.map(i =>
            `${i.emoji} ${i.name.padEnd(18)} ${RARITY_COLORS[i.rarity]} ${i.rarity.padEnd(10)} ${i.fmtR(price)} Robux`
          ).join('\n'),
          `\`\`\``,
          `Use \`.market info <id>\` to view item perks`,
          `Use \`.market buy <id>\` to purchase`,
          `Use \`.market inventory\` to view your collection`,
        ].join('\n'))
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'info') {
      const itemId = args[1]?.toLowerCase();
      const item = MARKET_ITEMS.find(i => i.id === itemId);
      if (!item) return message.reply({ embeds: [errorEmbed('Not Found', `Unknown item ID \`${itemId}\`. Use \`.market\` to browse.`)] });
      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle(`${item.emoji} ${item.name}`)
        .setDescription([
          `${RARITY_COLORS[item.rarity]} **${item.rarity}** · **${item.fmtR(price)}** ${config.currency}`,
          '',
          item.desc,
          '',
          '**Perks:**',
          item.perks.map(p => `• ${p}`).join('\n'),
        ].join('\n'))
        .setFooter({ text: `ID: ${item.id} · .market buy ${item.id}` })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'inventory' || sub === 'inv') {
      const user = getUser(message.author.id);
      const inv = user.inventory || {};
      if (Object.keys(inv).length === 0) {
        return message.reply({ embeds: [errorEmbed('Empty Inventory', 'You have no items.\nBrowse with `.market` and buy with `.market buy <id>`!')] });
      }
      const lines = Object.entries(inv).map(([id, qty]) => {
        const item = MARKET_ITEMS.find(i => i.id === id);
        if (!item) return null;
        return `${item.emoji} **${item.name}** × ${qty}  —  ${RARITY_COLORS[item.rarity]} ${item.rarity}`;
      }).filter(Boolean);
      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.gold).setTitle(`🎒 ${message.author.username}'s Collection`).setDescription(lines.join('\n') || 'No items.').setTimestamp()],
      });
    }

    if (sub === 'buy') {
      const itemId = args[1]?.toLowerCase();
      const item = MARKET_ITEMS.find(i => i.id === itemId);
      if (!item) return message.reply({ embeds: [errorEmbed('Not Found', `Unknown item \`${itemId}\`. Use \`.market\` to browse.`)] });

      const user = getUser(message.author.id);
      if (user.balance < item.price) {
        return message.reply({ embeds: [errorEmbed('Insufficient Actual Balance', [
          `You need **${item.fmtR(price)}** ${config.currency} (actual balance).`,
          `You have: **${user.fmtR(balance)}**`,
        ].join('\n'))] });
      }

      if (item.openable) {
        const game = beginGame(message.author.id, 1);
        user.balance -= item.price;
        const reward = Math.floor(game.floats[0] * 251) + 50;
        user.balance += reward;
        saveUser(message.author.id, user);

        saveGameRecord({
          gameId: game.gameId, type: 'mystery_box', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { item: 'mystery_box' },
          outcome: { reward, result: reward > item.price ? 'win' : 'lose' },
        });

        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.gold).setTitle('📦 Mystery Box Opened!')
            .setDescription([
              `You opened the **Mystery Box** and found **${reward}** ${config.currency}!`,
              `Net ${reward > item.price ? `+${reward - item.price}` : `${reward - item.price}`} ${config.currency}`,
              `💰 Balance: **${user.fmtR(balance)}** ${config.currency}`,
            ].join('\n'))
            .setFooter({ text: gameIdFooter(game.gameId) })
            .setTimestamp()],
        });
      }

      user.balance -= item.price;
      user.inventory = user.inventory || {};
      user.inventory[itemId] = (user.inventory[itemId] || 0) + 1;
      saveUser(message.author.id, user);

      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Purchase Complete!')
          .setDescription([
            `You bought ${item.emoji} **${item.name}** for **${item.fmtR(price)}** ${config.currency}!`,
            '',
            '**Your Perks:**',
            item.perks.map(p => `• ${p}`).join('\n'),
            '',
            `💰 Remaining balance: **${user.fmtR(balance)}** ${config.currency}`,
          ].join('\n')).setTimestamp()],
      });
    }

    if (sub === 'sell') {
      const itemId = args[1]?.toLowerCase();
      const item = MARKET_ITEMS.find(i => i.id === itemId);
      if (!item) return message.reply({ embeds: [errorEmbed('Not Found', `Unknown item \`${itemId}\`.`)] });
      const user = getUser(message.author.id);
      const inv = user.inventory || {};
      if (!inv[itemId] || inv[itemId] <= 0) return message.reply({ embeds: [errorEmbed('Not Owned', `You don't own **${item.name}**.`)] });

      const sellPrice = Math.floor(item.price * 0.5);
      inv[itemId]--;
      if (inv[itemId] === 0) delete inv[itemId];
      user.inventory = inv;
      user.balance += sellPrice;
      saveUser(message.author.id, user);

      return message.reply({
        embeds: [successEmbed('Item Sold', `Sold ${item.emoji} **${item.name}** for **${fmtR(sellPrice)}** ${config.currency} (50% resale).\n💰 Balance: **${user.fmtR(balance)}** ${config.currency}`)],
      });
    }

    message.reply({ embeds: [errorEmbed('Unknown Subcommand', 'Use: `.market` `.market buy <id>` `.market sell <id>` `.market info <id>` `.market inventory`')] });
  },
};
