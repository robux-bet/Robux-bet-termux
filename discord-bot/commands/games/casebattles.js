const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame, getActivePool } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, deriveWeightedItem, gameIdFooter } = require('../../utils/fairness');
const config = require('../../config');

const ITEMS = [
  { name: 'Rusty Blade',   rarity: 'Common',   emoji: '🗡️',  mult: 0, weight: 40 },
  { name: 'Bronze Shield', rarity: 'Common',   emoji: '🛡️',  mult: 0, weight: 25 },
  { name: 'Silver Ring',   rarity: 'Uncommon', emoji: '💍',  mult: 2, weight: 15 },
  { name: 'Magic Scroll',  rarity: 'Rare',     emoji: '📜',  mult: 3, weight: 10 },
  { name: 'Golden Sword',  rarity: 'Epic',     emoji: '⚔️',  mult: 5, weight: 6  },
  { name: 'Dragon Scale',  rarity: 'Legendary',emoji: '🐉',  mult: 8, weight: 3  },
  { name: 'Void Crystal',  rarity: 'Mythic',   emoji: '🔮',  mult: 15,weight: 1  },
];

const RARITY_COLOR = { Common:'⬜', Uncommon:'🟩', Rare:'🟦', Epic:'🟪', Legendary:'🟨', Mythic:'🌈' };

module.exports = {
  name: 'casebattles',
  aliases: ['cb', 'cases'],
  description: 'Open a case and battle — highest value wins the pot!',
  usage: '.casebattles <bet|all|half> @user',
  guildOnly: true,
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.reply({ embeds: [errorEmbed('PvP Only', 'Case battles are PvP only — mention an opponent!\n`Usage: .casebattles <bet> @user`')] });
    }

    const oppPool = getActivePool(opponent.id);
    if (oppPool.amount < bet) {
      return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough ${config.currency}.`)] });
    }
    const oppIsDemo = oppPool.isDemo;

    const joinRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cb_accept').setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cb_decline').setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
    );
    const joinEmbed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📦 Case Battle Challenge')
      .setDescription([
        `${message.author} challenged ${opponent} to a Case Battle!`,
        `Bet: **${bet.toLocaleString()}** ${config.currency} each | Pot: **${(bet * 2).toLocaleString()}** ${config.currency}`,
        `${opponent.username}, click **Accept**!`,
      ].join('\n'))
      .setTimestamp();
    const msg = await message.reply({ embeds: [joinEmbed], components: [joinRow] });

    const joinCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button, filter: i => i.user.id === opponent.id, time: 30000, max: 1,
    });

    joinCollector.on('collect', async i => {
      if (i.customId === 'cb_decline') {
        await i.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('Declined').setDescription(`${opponent.username} declined.`).setTimestamp()], components: [] });
        return;
      }
      await i.deferUpdate();
      spendBet(message.author.id, bet, isDemo);
      spendBet(opponent.id, bet, oppIsDemo);
      await runBattle(msg, bet, message.author, opponent, isDemo, oppIsDemo);
    });

    joinCollector.on('end', (_, reason) => {
      if (reason === 'time') msg.edit({ content: '⏰ Challenge expired.', components: [] }).catch(() => {});
    });
  },
};

async function runBattle(msg, bet, p1User, p2User, p1IsDemo, p2IsDemo) {
  const game = beginGame(p1User.id, 2);

  for (let f = 0; f < 4; f++) {
    await new Promise(r => setTimeout(r, 600));
    const fakeItems = Array.from({ length: 3 }, () => ITEMS[Math.floor(Math.random() * ITEMS.length)]);
    const fakeItems2 = Array.from({ length: 3 }, () => ITEMS[Math.floor(Math.random() * ITEMS.length)]);
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('📦 Opening Cases...')
      .setDescription([
        `**${p1User.username}:** ${fakeItems.map(i => i.emoji).join(' ')}`,
        `**${p2User.username}:** ${fakeItems2.map(i => i.emoji).join(' ')}`,
        `🌀 Spinning...`,
      ].join('\n')).setTimestamp();
    await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }

  await new Promise(r => setTimeout(r, 800));
  const p1Item = deriveWeightedItem(game.floats[0], ITEMS);
  const p2Item = deriveWeightedItem(game.floats[1], ITEMS);
  const p1Won = p1Item.mult >= p2Item.mult;
  const pot = bet * 2;
  const winner = p1Won ? p1User : p2User;
  const winnerIsDemo = p1Won ? p1IsDemo : p2IsDemo;

  const payout = calcPayout(pot, 1, false);
  addWin(winner.id, payout, winnerIsDemo);
  recordGame(p1User.id, p1Won, p1Won ? payout - bet : bet);
  recordGame(p2User.id, !p1Won, !p1Won ? payout - bet : bet);

  saveGameRecord({
    gameId: game.gameId, type: 'casebattles', userId: p1User.id,
    serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
    clientSeed: game.clientSeed, nonce: game.nonce,
    inputs: { p1: p1User.username, p2: p2User.username },
    outcome: { p1Item: p1Item.name, p2Item: p2Item.name, winner: winner.username, result: p1Won ? 'win' : 'lose' },
  });

  const newBal = p1IsDemo ? getUser(p1User.id).demoBalance : getUser(p1User.id).balance;

  const embed = new EmbedBuilder()
    .setColor(p1Won ? config.colors.success : config.colors.error)
    .setTitle('📦 Case Battle Result')
    .addFields(
      { name: `${p1User.username}'s Item`, value: `${RARITY_COLOR[p1Item.rarity]} ${p1Item.emoji} **${p1Item.name}** (${p1Item.rarity}) · ${p1Item.mult}x`, inline: true },
      { name: `${p2User.username}'s Item`, value: `${RARITY_COLOR[p2Item.rarity]} ${p2Item.emoji} **${p2Item.name}** (${p2Item.rarity}) · ${p2Item.mult}x`, inline: true },
    )
    .setDescription([
      p1Won
        ? `🏆 **${p1User.username} wins!** +**${(payout - bet).toLocaleString()}** ${config.currency}!`
        : `💔 **${p2User.username} wins!** ${p1User.username} lost **${bet.toLocaleString()}** ${config.currency}.`,
      `💰 ${p1User.username}'s balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(p1IsDemo)}`,
    ].join('\n'))
    .setFooter({ text: gameIdFooter(game.gameId) })
    .setTimestamp();

  msg.edit({ embeds: [embed], components: [] }).catch(() => {});
}
