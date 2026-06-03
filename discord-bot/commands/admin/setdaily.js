const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser, addBalance } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

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
  name: 'setdaily',
  description: 'Force a daily spin for a user (bypasses all requirements)',
  usage: '.setdaily @user',
  adminOnly: true,
  guildOnly: true,
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid Usage', 'Please mention a user.\n`Usage: .setdaily @user`')] });

    const buildWheel = (spinning, winner) => WHEEL_SEGMENTS.map(seg => {
      if (!spinning && winner && seg.value === winner.value) return `**[${seg.emoji}${seg.label}]**`;
      return `${seg.emoji}${seg.label}`;
    }).join(' ');

    const embed = new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle(`🎡 Daily Spin — ${target.username}`)
      .setDescription(`${buildWheel(true, null)}\n\n🌀 **Spinning...**`)
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });

    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 700));
      embed.setDescription(`${buildWheel(true, null)}\n\n${SPIN_FRAMES[i % SPIN_FRAMES.length]} **Spinning...**`);
      await reply.edit({ embeds: [embed] }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 900));

    const result = weightedRandom();
    const user = getUser(target.id);
    user.lastDaily = Date.now();
    saveUser(target.id, user);
    addBalance(target.id, result.value);
    const newBal = getUser(target.id).balance;

    embed
      .setColor(config.colors.success)
      .setTitle(`🎡 Daily Spin Result — ${target.username}`)
      .setDescription([
        buildWheel(false, result),
        '',
        `🎉 Landed on **${result.emoji} ${result.label}**!`,
        `${target} received **${result.value}** ${config.currency}`,
        '',
        `💰 New balance: **${newBal.toLocaleString()}** ${config.currency}`,
      ].join('\n'))
      .setFooter({ text: `Triggered by ${message.author.tag}` });

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
