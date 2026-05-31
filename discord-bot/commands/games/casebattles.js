const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const CASE_ITEMS = [
  { name: 'Rusty Blade', rarity: 'Common',    emoji: '🗡️',  mult: 0.1,  weight: 40 },
  { name: 'Bronze Shield', rarity: 'Common',  emoji: '🛡️',  mult: 0.2,  weight: 30 },
  { name: 'Silver Ring',   rarity: 'Uncommon',emoji: '💍',  mult: 0.5,  weight: 15 },
  { name: 'Magic Scroll',  rarity: 'Rare',    emoji: '📜',  mult: 1.0,  weight: 8  },
  { name: 'Golden Sword',  rarity: 'Epic',    emoji: '⚔️',  mult: 2.5,  weight: 4  },
  { name: 'Dragon Scale',  rarity: 'Legendary',emoji: '🐉', mult: 5.0,  weight: 2  },
  { name: 'Void Crystal',  rarity: 'Mythic',  emoji: '🔮',  mult: 10.0, weight: 1  },
];

const RARITY_COLORS = {
  Common: '⬜', Uncommon: '🟩', Rare: '🟦', Epic: '🟪', Legendary: '🟨', Mythic: '🌈',
};

function openCase() {
  const total = CASE_ITEMS.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of CASE_ITEMS) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return CASE_ITEMS[0];
}

module.exports = {
  name: 'casebattles',
  aliases: ['cb', 'cases'],
  description: 'Open a case and battle — highest value wins the pot!',
  usage: '.casebattles <bet> [@user]',
  guildOnly: true,
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .casebattles <bet> [@user]`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const opponent = message.mentions.users.first();
    const vsBot = !opponent || opponent.bot || opponent.id === message.author.id;

    if (!vsBot) {
      const oppUser = getUser(opponent.id);
      if (oppUser.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough.`)] });
    }

    removeBalance(message.author.id, bet);

    if (!vsBot) {
      // Ask opponent to join
      const joinEmbed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📦 Case Battle')
        .setDescription(`${message.author} has challenged ${opponent} to a **Case Battle**!\n\nBet: **${bet.toLocaleString()}** ${config.currency} each\nTotal pot: **${(bet * 2).toLocaleString()}** ${config.currency}\n\n${opponent}, click **Accept** to join!`)
        .setTimestamp();

      const joinRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cb_accept').setLabel('✅ Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cb_decline').setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
      );
      const joinMsg = await message.reply({ embeds: [joinEmbed], components: [joinRow] });

      const joinCollector = joinMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === opponent.id,
        time: 30000, max: 1,
      });

      joinCollector.on('collect', async i => {
        if (i.customId === 'cb_decline') {
          addBalance(message.author.id, bet);
          await i.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('Case Battle Declined').setDescription(`${opponent.username} declined the challenge.`).setTimestamp()], components: [] });
          return;
        }
        removeBalance(opponent.id, bet);
        await i.deferUpdate();
        await runBattle(message, joinMsg, bet, message.author, opponent, false);
      });

      joinCollector.on('end', (_, reason) => {
        if (reason === 'time') {
          addBalance(message.author.id, bet);
          joinMsg.edit({ content: '⏰ Challenge expired.', components: [] }).catch(() => {});
        }
      });
      return;
    }

    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle('📦 Case Battle').setDescription('Opening cases...').setTimestamp()] });
    await runBattle(message, reply, bet, message.author, null, true);
  },
};

async function runBattle(message, reply, bet, p1User, p2User, vsBot) {
  const { getUser, addBalance, recordGame } = require('../../utils/database');
  const config = require('../../config');

  const p2Name = vsBot ? 'House Bot' : p2User.username;

  // Animate case opening
  const SPIN_ITEMS = Array.from({ length: 6 }, openCase);
  const SPIN_ITEMS2 = Array.from({ length: 6 }, openCase);

  const spinEmbed = (frame) => new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('📦 Case Battle — Opening!')
    .setDescription([
      `**${p1User.username}:** ${SPIN_ITEMS.slice(frame, frame + 3).map(i => i.emoji).join(' ')}`,
      `**${p2Name}:** ${SPIN_ITEMS2.slice(frame, frame + 3).map(i => i.emoji).join(' ')}`,
      '\n🌀 Spinning...',
    ].join('\n'))
    .setTimestamp();

  for (let f = 0; f < 4; f++) {
    await new Promise(r => setTimeout(r, 700));
    await reply.edit({ embeds: [spinEmbed(f)], components: [] }).catch(() => {});
  }

  await new Promise(r => setTimeout(r, 800));

  const p1Item = openCase();
  const p2Item = openCase();
  const p1Val = Math.floor(bet * p1Item.mult);
  const p2Val = Math.floor(bet * p2Item.mult);

  const won = p1Val >= p2Val;
  const pot = bet * 2;

  if (won) {
    addBalance(p1User.id, pot);
    recordGame(p1User.id, true, pot - bet);
    if (!vsBot && p2User) recordGame(p2User.id, false, bet);
  } else {
    recordGame(p1User.id, false, bet);
    if (!vsBot && p2User) { addBalance(p2User.id, pot); recordGame(p2User.id, true, pot - bet); }
  }

  const newBal = getUser(p1User.id).balance;

  const resultEmbed = new EmbedBuilder()
    .setColor(won ? config.colors.success : config.colors.error)
    .setTitle('📦 Case Battle Result')
    .addFields(
      { name: `${p1User.username}'s Item`, value: `${RARITY_COLORS[p1Item.rarity]} ${p1Item.emoji} **${p1Item.name}** (${p1Item.rarity})\nValue: **${p1Val.toLocaleString()}** ${config.currency}`, inline: true },
      { name: `${p2Name}'s Item`, value: `${RARITY_COLORS[p2Item.rarity]} ${p2Item.emoji} **${p2Item.name}** (${p2Item.rarity})\nValue: **${p2Val.toLocaleString()}** ${config.currency}`, inline: true },
    )
    .setDescription([
      won ? `🏆 **${p1User.username} wins the pot!** +**${(pot - bet).toLocaleString()}** ${config.currency}!` : `💔 **${p2Name} wins!** Lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`,
    ].join('\n'))
    .setTimestamp();

  reply.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});
}
