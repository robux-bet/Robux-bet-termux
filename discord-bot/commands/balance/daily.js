const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser, addBalance } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const COOLDOWN = 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const WHEEL_SEGMENTS = [
  { label: '1', value: 1, emoji: '🟤', weight: 20 },
  { label: '2', value: 2, emoji: '🔵', weight: 18 },
  { label: '3', value: 3, emoji: '🟢', weight: 15 },
  { label: '4', value: 4, emoji: '🟡', weight: 13 },
  { label: '5', value: 5, emoji: '🟠', weight: 11 },
  { label: '6', value: 6, emoji: '🔴', weight: 9 },
  { label: '7', value: 7, emoji: '🟣', weight: 7 },
  { label: '8', value: 8, emoji: '💜', weight: 4 },
  { label: '9', value: 9, emoji: '💛', weight: 2 },
  { label: '10', value: 10, emoji: '⭐', weight: 1 },
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

function hasRequiredStatus(member, code) {
  const presence = member?.presence;
  if (!presence) return false;
  const custom = presence.activities.find(a => a.type === 4);
  return !!(custom?.state?.toLowerCase().includes(`best roblox gambling servers discord.gg/${code.toLowerCase()}`));
}

const SPIN_FRAMES = ['🌀', '💫', '⭐', '✨', '🌟'];

module.exports = {
  name: 'daily',
  description: 'Spin the wheel for 1-10 free Robux (once every 24h)',
  usage: '.daily',
  async execute(message) {
    const user = getUser(message.author.id);
    const now = Date.now();

    // 1) Cooldown check
    if (user.lastDaily && now - user.lastDaily < COOLDOWN) {
      const remaining = COOLDOWN - (now - user.lastDaily);
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      return message.reply({
        embeds: [errorEmbed('On Cooldown', `You already claimed your daily!\nCome back in **${hours}h ${minutes}m ${seconds}s**`)],
      });
    }

    // 2) Check all 3 requirements
    const code = user.statusCode;
    const hasStatus = hasRequiredStatus(message.member, code);
    const hasWagered = user.lastWagered && (now - user.lastWagered < DAY);
    const hasDeposited = user.lastDeposited && (now - user.lastDeposited < DAY);
    const allMet = hasStatus && hasWagered && hasDeposited;

    if (!allMet) {
      const req = (met, label) => `${met ? '✅' : '❌'} ${label}`;
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('🎡 Daily Requirements Not Met')
        .setDescription([
          'You must meet **all 3 requirements** to spin the daily wheel:',
          '',
          req(hasStatus,   `Custom status set to:\n\`\`\`best roblox gambling servers discord.gg/${code}\`\`\``),
          req(hasWagered,  'Wagered at least **1 Robux** in the past 24h'),
          req(hasDeposited,'Deposited at least **1 Robux** in the past 24h'),
          '',
          hasStatus ? '' : `> Run \`.mycode\` to see your required status text.`,
        ].filter(l => l !== null).join('\n'))
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    const result = weightedRandom();

    const buildWheel = (spinning, winner) => {
      const slots = WHEEL_SEGMENTS.map(seg => {
        if (!spinning && seg.value === winner.value) return `**[${seg.emoji}${seg.label}]**`;
        return `${seg.emoji}${seg.label}`;
      });
      return slots.join(' ');
    };

    const embed = new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle('🎡 Daily Spin Wheel')
      .setDescription(`${buildWheel(true, null)}\n\n🌀 **Spinning...**`)
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });

    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 700));
      const frame = SPIN_FRAMES[i % SPIN_FRAMES.length];
      embed.setDescription(`${buildWheel(true, null)}\n\n${frame} **Spinning...**`);
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
        ``,
        `💰 New balance: **${newBal.toLocaleString()}** ${config.currency}`,
      ].join('\n'));

    reply.edit({ embeds: [embed] }).catch(() => {});
  },
};
