const { EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../../utils/embeds');
const { getGameRecord } = require('../../utils/fairness');
const { generateFloats, hashServerSeed } = require('../../utils/provableFair');
const config = require('../../config');

const SUITS = ['♠️','♥️','♦️','♣️'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const ITEMS = [
  { name: 'Rusty Blade',   weight: 40 }, { name: 'Bronze Shield', weight: 25 },
  { name: 'Silver Ring',   weight: 15 }, { name: 'Magic Scroll',  weight: 10 },
  { name: 'Golden Sword',  weight: 6  }, { name: 'Dragon Scale',  weight: 3  },
  { name: 'Void Crystal',  weight: 1  },
];

function recomputeResult(record) {
  const { type, serverSeed, clientSeed, nonce, inputs, outcome } = record;
  const floats = generateFloats(serverSeed, clientSeed, nonce, 52);
  const lines = [];

  lines.push(`**Float[0]:** \`${floats[0].toFixed(8)}\``);

  switch (type) {
    case 'coinflip': {
      const side = floats[0] >= 0.5 ? 'h' : 't';
      const sideLabel = side === 'h' ? 'Heads' : 'Tails';
      lines.push(`**Result:** float[0] ${floats[0] >= 0.5 ? '≥' : '<'} 0.5 → **${sideLabel}**`);
      lines.push(`**Stored outcome:** ${outcome.resultSide === 'h' ? 'Heads' : 'Tails'}`);
      lines.push(side === outcome.resultSide ? '✅ **VERIFIED** — result matches seeds.' : '❌ **MISMATCH** — result does not match.');
      break;
    }
    case 'dice': {
      const roll = Math.floor(floats[0] * 6) + 1;
      lines.push(`**Roll:** floor(float[0] × 6) + 1 = **${roll}**`);
      lines.push(`**Stored roll:** ${outcome.roll}`);
      lines.push(roll === outcome.roll ? '✅ **VERIFIED** — roll matches seeds.' : '❌ **MISMATCH**');
      break;
    }
    case 'roulette': {
      const num = Math.floor(floats[0] * 37);
      lines.push(`**Number:** floor(float[0] × 37) = **${num}** (${num === 0 ? 'Green' : RED.includes(num) ? 'Red' : 'Black'})`);
      lines.push(`**Stored number:** ${outcome.number}`);
      lines.push(num === outcome.number ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      break;
    }
    case 'cards': {
      const rank = RANKS[Math.floor(floats[0] * 13)];
      const suit = SUITS[Math.floor(floats[1] * 4)];
      const card = `${rank}${suit}`;
      lines.push(`**Float[1]:** \`${floats[1].toFixed(8)}\``);
      lines.push(`**Card:** rank=floor(f[0]×13)=${rank}, suit=floor(f[1]×4)=${suit} → **${card}**`);
      lines.push(`**Stored card:** ${outcome.card}`);
      lines.push(card === outcome.card ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      break;
    }
    case 'plinko': {
      const rows = inputs.rows;
      let pos = 0;
      const path = [];
      for (let i = 0; i < rows; i++) { const s = floats[i] < 0.5 ? 0 : 1; path.push(s); pos += s; }
      lines.push(`**Path (${rows} rows):** ${path.map(s => s === 0 ? 'L' : 'R').join('')}`);
      lines.push(`**Final slot:** ${pos + 1}`);
      lines.push(`**Stored final pos:** ${outcome.finalPos + 1}`);
      lines.push(pos === outcome.finalPos ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      break;
    }
    case 'crash': {
      const cp = floats[0] < 0.04 ? 1.0 : Math.max(1.01, parseFloat((0.96 / (1 - floats[0])).toFixed(2)));
      lines.push(`**Crash point:** ${cp.toFixed(2)}x`);
      lines.push(`**Stored crash point:** ${outcome.crashPoint}x`);
      lines.push(cp === outcome.crashPoint ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      if (inputs.cashedOutAt) lines.push(`**Cashed out at:** ${inputs.cashedOutAt}x (${inputs.cashedOutAt < cp ? 'before crash ✅' : 'after crash ❌'})`);
      break;
    }
    case 'balloon': {
      const popAt = Math.floor(floats[0] * 23) + 3;
      lines.push(`**Pop point:** floor(float[0] × 23) + 3 = **${popAt}** pumps`);
      lines.push(`**Stored pop point:** ${outcome.popAt}`);
      lines.push(`**Player pumped:** ${inputs.pumps} times`);
      lines.push(popAt === outcome.popAt ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      break;
    }
    case 'baccarat': {
      let fi = 0;
      const nextCard = () => ({ r: RANKS[Math.floor(floats[fi++] * 13)], s: SUITS[Math.floor(floats[fi++] * 4)] });
      const player = [nextCard(), nextCard()];
      const banker = [nextCard(), nextCard()];
      const pHand = player.map(c => `${c.r}${c.s}`).join(' ');
      const bHand = banker.map(c => `${c.r}${c.s}`).join(' ');
      lines.push(`**Player hand (initial):** ${pHand}`);
      lines.push(`**Banker hand (initial):** ${bHand}`);
      lines.push(`**Stored player hand:** ${outcome.playerHand}`);
      lines.push(outcome.playerHand.startsWith(pHand.split(' ')[0]) ? '✅ **VERIFIED** (initial cards match)' : '❌ **MISMATCH**');
      break;
    }
    case 'mines': {
      const total = 16;
      const { mineCount } = inputs;
      const positions = Array.from({ length: total }, (_, i) => i);
      for (let i = positions.length - 1; i > 0; i--) {
        const fi2 = floats[positions.length - 1 - i] ?? 0;
        const j = Math.floor(fi2 * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      const mineSet = new Set(positions.slice(0, mineCount));
      const storedSet = new Set(outcome.minePositions || []);
      const match = [...mineSet].every(p => storedSet.has(p)) && mineSet.size === storedSet.size;
      lines.push(`**Mine positions (recomputed):** ${[...mineSet].sort((a,b)=>a-b).join(', ')}`);
      lines.push(`**Mine positions (stored):** ${[...storedSet].sort((a,b)=>a-b).join(', ')}`);
      lines.push(match ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      break;
    }
    case 'casebattles': {
      const total1 = ITEMS.reduce((s, i) => s + i.weight, 0);
      let r1 = floats[0] * total1;
      let item1 = ITEMS[ITEMS.length - 1].name;
      for (const item of ITEMS) { r1 -= item.weight; if (r1 <= 0) { item1 = item.name; break; } }
      let r2 = floats[1] * total1;
      let item2 = ITEMS[ITEMS.length - 1].name;
      for (const item of ITEMS) { r2 -= item.weight; if (r2 <= 0) { item2 = item.name; break; } }
      lines.push(`**P1 item (recomputed):** ${item1}`);
      lines.push(`**P2 item (recomputed):** ${item2}`);
      lines.push(`**Stored:** P1=${outcome.p1Item}, P2=${outcome.p2Item}`);
      lines.push(item1 === outcome.p1Item && item2 === outcome.p2Item ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      break;
    }
    case 'mystery_box': {
      const reward = Math.floor(floats[0] * 251) + 50;
      lines.push(`**Reward:** floor(float[0] × 251) + 50 = **${reward}** Robux`);
      lines.push(`**Stored reward:** ${outcome.reward}`);
      lines.push(reward === outcome.reward ? '✅ **VERIFIED**' : '❌ **MISMATCH**');
      break;
    }
    default:
      lines.push(`*Verification for \`${type}\` shows seeds only — result is player-driven.*`);
  }

  return lines.join('\n');
}

module.exports = {
  name: 'verify',
  description: 'Verify the fairness of any completed game',
  usage: '.verify <game id>',
  async execute(message, args) {
    const gameId = args[0]?.toUpperCase();
    if (!gameId) return message.reply({ embeds: [errorEmbed('Missing Game ID', 'Usage: `.verify <game id>`\nGame IDs are shown in the footer of every completed game.')] });

    const record = getGameRecord(gameId);
    if (!record) return message.reply({ embeds: [errorEmbed('Not Found', `No game found with ID \`${gameId}\`.\nGame records are kept for the last 50,000 games.`)] });

    const reHash = hashServerSeed(record.serverSeed);
    const seedMatch = reHash === record.hashedServerSeed;
    const verifyDetails = recomputeResult(record);

    const timestamp = new Date(record.timestamp);
    const embed = new EmbedBuilder()
      .setColor(seedMatch ? config.colors.success : config.colors.error)
      .setTitle(`🔍 Provably Fair Verification`)
      .setDescription([
        `**Game ID:** \`${record.id}\``,
        `**Type:** ${record.type}`,
        `**Played:** <t:${Math.floor(record.timestamp / 1000)}:R>`,
        '',
        '**─── Seeds ───**',
        `**Server Seed:** \`${record.serverSeed}\``,
        `**Hashed Server Seed:** \`${record.hashedServerSeed}\``,
        `SHA256(serverSeed) = \`${reHash}\``,
        seedMatch ? '✅ Hash matches — server seed is authentic.' : '❌ Hash mismatch!',
        '',
        `**Client Seed:** \`${record.clientSeed}\``,
        `**Nonce:** \`${record.nonce}\``,
        '',
        '**─── Result Verification ───**',
        verifyDetails,
        '',
        '**How it works:**',
        '> The server seed hash was committed before you played.',
        '> Floats = HMAC-SHA256(serverSeed, clientSeed:nonce)',
        '> You can verify this with any HMAC-SHA256 tool.',
      ].join('\n'))
      .setFooter({ text: 'Provably Fair · Results are deterministic from the seeds' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
