const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, saveUser, removeBalance, addBalance } = require('../../utils/database');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const config = require('../../config');

const MARKET_ITEMS = [
  { id: 'lucky_charm',  name: 'Lucky Charm',  emoji: '🍀', price: 50,  desc: '+5% win chance for 5 games', uses: 5 },
  { id: 'gold_coin',    name: 'Gold Coin',    emoji: '🪙', price: 100, desc: 'Sell for profit or use as currency', uses: 1 },
  { id: 'shield',       name: 'Shield',       emoji: '🛡️', price: 75,  desc: 'Protects from one loss', uses: 1 },
  { id: 'dice_boost',   name: 'Loaded Dice',  emoji: '🎲', price: 80,  desc: 'Slight boost on dice rolls', uses: 3 },
  { id: 'vip_pass',     name: 'VIP Pass',     emoji: '⭐', price: 200, desc: 'Shows you\'re VIP (cosmetic)', uses: 1 },
  { id: 'mystery_box',  name: 'Mystery Box',  emoji: '📦', price: 120, desc: 'Open for a random Robux reward', uses: 1 },
];

module.exports = {
  name: 'market',
  aliases: ['shop', 'store'],
  description: 'Buy and sell virtual items with your Robux',
  usage: '.market [buy <item>|sell <item>|inventory]',
  async execute(message, args) {
    const sub = args[0]?.toLowerCase() || 'browse';

    if (sub === 'browse' || sub === 'list') {
      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🏪 Market')
        .setDescription(`Browse and buy items with your ${config.currency}!\nUse \`.market buy <item_id>\` to purchase.\nUse \`.market inventory\` to view your items.`)
        .addFields(
          MARKET_ITEMS.map(item => ({
            name: `${item.emoji} ${item.name} — **${item.price}** ${config.currency}`,
            value: `ID: \`${item.id}\` | ${item.desc}`,
            inline: false,
          }))
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'inventory' || sub === 'inv') {
      const user = getUser(message.author.id);
      const inv = user.inventory || {};
      if (Object.keys(inv).length === 0) {
        return message.reply({ embeds: [errorEmbed('Empty Inventory', 'You have no items. Use `.market` to browse!')] });
      }
      const lines = Object.entries(inv).map(([id, qty]) => {
        const item = MARKET_ITEMS.find(i => i.id === id);
        return item ? `${item.emoji} **${item.name}** × ${qty}` : `\`${id}\` × ${qty}`;
      });
      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle('🎒 Your Inventory').setDescription(lines.join('\n')).setTimestamp()],
      });
    }

    if (sub === 'buy') {
      const itemId = args[1]?.toLowerCase();
      const item = MARKET_ITEMS.find(i => i.id === itemId);
      if (!item) return message.reply({ embeds: [errorEmbed('Item Not Found', `Invalid item ID. Use \`.market\` to browse.`)] });

      const user = getUser(message.author.id);
      if (user.balance < item.price) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You need **${item.price}** ${config.currency}. You have **${user.balance.toLocaleString()}**.`)] });

      // Special: mystery box opens immediately
      if (itemId === 'mystery_box') {
        removeBalance(message.author.id, item.price);
        const reward = Math.floor(Math.random() * 200) + 10;
        addBalance(message.author.id, reward);
        const newBal = getUser(message.author.id).balance;
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.gold).setTitle('📦 Mystery Box Opened!')
            .setDescription([`You opened the mystery box and found **${reward}** ${config.currency}!`, `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`].join('\n')).setTimestamp()],
        });
      }

      removeBalance(message.author.id, item.price);
      const user2 = getUser(message.author.id);
      user2.inventory = user2.inventory || {};
      user2.inventory[itemId] = (user2.inventory[itemId] || 0) + 1;
      saveUser(message.author.id, user2);

      return message.reply({
        embeds: [successEmbed('Item Purchased', `You bought ${item.emoji} **${item.name}** for **${item.price}** ${config.currency}!\n\n${item.desc}`)],
      });
    }

    if (sub === 'sell') {
      const itemId = args[1]?.toLowerCase();
      const item = MARKET_ITEMS.find(i => i.id === itemId);
      if (!item) return message.reply({ embeds: [errorEmbed('Item Not Found', 'Invalid item ID.')] });

      const user = getUser(message.author.id);
      const inv = user.inventory || {};
      if (!inv[itemId] || inv[itemId] <= 0) return message.reply({ embeds: [errorEmbed('Not Owned', `You don't own any **${item.name}**.`)] });

      const sellPrice = Math.floor(item.price * 0.6);
      inv[itemId]--;
      if (inv[itemId] === 0) delete inv[itemId];
      user.inventory = inv;
      saveUser(message.author.id, user);
      addBalance(message.author.id, sellPrice);
      const newBal = getUser(message.author.id).balance;

      return message.reply({
        embeds: [successEmbed('Item Sold', `Sold ${item.emoji} **${item.name}** for **${sellPrice}** ${config.currency} (60% of price).\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`)],
      });
    }

    return message.reply({ embeds: [errorEmbed('Unknown Subcommand', 'Use: `.market` `.market buy <id>` `.market sell <id>` `.market inventory`')] });
  },
};
