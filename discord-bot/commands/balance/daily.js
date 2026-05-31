const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, saveUser, addBalance } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const COOLDOWN = 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const MIN_WAGER = 10;
const MIN_DEPOSIT = 10;

const WHEEL_SEGMENTS = [
  { label: '1',  value: 1,  emoji: '🟤', weight: 20 },
  { label: '2',  value: 2,  emoji: '🔵', weight: 18 },
  { label: '3',  value: 3,  emoji: '🟢', weight: 15 },
  { label: '4',  value: 4,  emoji: '🟡', weight: 13 },
  { label: '5',  value: 5,  emoji: '🟠', weight: 11 },
  { label: '6',  value: 6,  emoji: '🔴', weight: 9  },
  { label: '7',  value: 7,  emoji: '🟣', weight: 7  },
  { label: '8',  value: 8,  emoji: '💜', weight: 4  },
  { label: '9',  value: 9,  emoji: '💛', weight: 2  },
  { label: '10', value: 10, emoji: '⭐', weight: 1  },
];

function weightedRandom() {
  const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let r = Math.random() * total;
  for (const seg of WHEEL_SEGMENTS) {
    r -= seg.weight;
    if (r <= 0) return seg;
  }
  return WHEEL_SEGMENTS[0];
}

const SPIN_FRAMES = ['🌀', '💫', '⭐', '✨', '🌟'];

module.exports = {
  name: 'daily',
  description: 'Spin the wheel for 1-10 free Robux (once every 24h)',
  usage: '.daily',
  async execute(message) {
    const user = getUser(message.author.id);
    const now = Date.now();

    // Cooldown check
    if (user.lastDaily && now - user.lastDaily < COOLDOWN) {
      const remaining = COOLDOWN - (now - user.lastDaily);
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      return message.reply({
        embeds: [errorEmbed('On Cooldown', `You already claimed your daily!\nCome back in **${hours}h ${minutes}m ${seconds}s**`)],
      });
    }

    // Requirements check
    const hasWagered = user.lastWagered && (now - user.lastWagered < DAY);
    const hasDeposited = user.lastDeposited && (now - user.lastDeposited < DAY);

    if (!hasWagered || !hasDeposited) {
      const req = (met, label) => `${met ? '✅' : '❌'} ${label}`;
      const unmetCount = [hasWagered, hasDeposited].filter(v => !v).length;

      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle(`🎡 Daily — ${unmetCount} Requirement${unmetCount !== 1 ? 's' : ''} Not Met`)
        .setDescription([
          req(hasWagered,   `Wager at least **${MIN_WAGER} Robux** (real balance) in the past 24h`),
          req(hasDeposited, `Have at least **${MIN_DEPOSIT} Robux** deposited in the past 24h`),
        ].join('\n'))
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // Spin
    const result = weightedRandom();

    const buildWheel = (spinning, winner) => {
      return WHEEL_SEGMENTS.map(seg => {
        if (!spinning && seg.value === winner.value) return `**[${seg.emoji}${seg.label}]**`;
        return `${seg.emoji}${seg.label}`;
      }).join(' ');
    };

    const embed = new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle('🎡 Daily Spin Wheel')
      .setDescription(`${buildWheel(true, null)}\n\n🌀 **Spinning...**`)
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });

    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 700));
      embed.setDescription(`${buildWheel(true, null)}\n\n${SPIN_FRAMES[i % SPIN_FRAMES.length]} **Spinning...**`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 900));

    user.lastDaily = now;
    saveUser(message.author.id, user);
    addBalance(message.author.id, result.value);
    const newBal = getUser(message.author.id).balance;

    embed
      .setColor(config.colors.success)
      .setTitle('🎡 Daily Spin Result!')
      .setDescription([
        buildWheel(false, result),
        '',
        `🎉 You landed on **${result.emoji} ${result.label}**!`,
        `You received **${result.value}** ${config.currency}`,
        '',
        `💰 New balance: **${newBal.toLocaleString()}** ${config.currency}`,
      ].join('\n'))
      .setFooter({ text: 'Best Roblox Gambling Server · discord.gg/n7wWqamv6b' });

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
