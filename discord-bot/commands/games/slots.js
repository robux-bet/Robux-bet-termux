const { EmbedBuilder } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const SYMBOLS = [
  { emoji: '🍒', name: 'Cherry',  weight: 30, mult: 1.5 },
  { emoji: '🍋', name: 'Lemon',   weight: 25, mult: 2 },
  { emoji: '🍊', name: 'Orange',  weight: 20, mult: 2.5 },
  { emoji: '🍇', name: 'Grape',   weight: 15, mult: 3 },
  { emoji: '🔔', name: 'Bell',    weight: 7,  mult: 5 },
  { emoji: '💎', name: 'Diamond', weight: 2,  mult: 10 },
  { emoji: '7️⃣', name: 'Seven',   weight: 1,  mult: 20 },
];

function spin() {
  const total = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
  let r = Math.random() * total;
  for (const sym of SYMBOLS) {
    r -= sym.weight;
    if (r <= 0) return sym;
  }
  return SYMBOLS[0];
}

function getMultiplier(reels) {
  const [a, b, c] = reels;
  if (a.name === b.name && b.name === c.name) return a.mult * 3;
  if (a.name === b.name || b.name === c.name) return b.mult * 0.5;
  if (a.name === c.name) return a.mult * 0.5;
  return 0;
}

module.exports = {
  name: 'slots',
  aliases: ['slot'],
  description: 'Spin the slot machine',
  usage: '.slots <bet>',
  async execute(message, args) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Enter a valid bet amount.\n`Usage: .slots <bet>`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    removeBalance(message.author.id, bet);

    const reels = [spin(), spin(), spin()];
    const mult = getMultiplier(reels);
    const won = mult > 0;
    const winnings = Math.floor(bet * mult);

    if (won) addBalance(message.author.id, winnings);
    recordGame(message.author.id, won, won ? winnings - bet : bet);

    const newBal = getUser(message.author.id).balance;

    // Animate slot spin
    const slotDisplay = () => `| ${spin().emoji} ${spin().emoji} ${spin().emoji} |`;
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🎰 Slot Machine')
      .setDescription(`| 🌀 🌀 🌀 |\n\n⏳ Spinning...`)
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });

    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 500));
      embed.setDescription(`${slotDisplay()}\n\n⏳ Spinning...`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 700));

    const resultLine = `| ${reels[0].emoji} ${reels[1].emoji} ${reels[2].emoji} |`;
    const paylines = [
      `🍒 Cherry x1.5 · 🍋 Lemon x2 · 🍊 Orange x2.5`,
      `🍇 Grape x3 · 🔔 Bell x5 · 💎 Diamond x10 · 7️⃣ Seven x20`,
    ];

    embed
      .setColor(won ? config.colors.success : config.colors.error)
      .setTitle('🎰 Slot Machine')
      .setDescription([
        `${resultLine}`,
        '',
        won
          ? `🎉 **${reels[0].name === reels[1].name && reels[1].name === reels[2].name ? 'JACKPOT' : 'Win'}!** ${mult}x → +**${winnings.toLocaleString()}** ${config.currency}`
          : `😢 No match. Lost **${bet.toLocaleString()}** ${config.currency}`,
        `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
        '',
        '*Paytable (3-of-a-kind x3 bonus):*',
        ...paylines,
      ].join('\n'));

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
