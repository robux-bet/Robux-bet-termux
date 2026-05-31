const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

function rollDie() { return Math.floor(Math.random() * 6) + 1; }
function rollTwo() { const a = rollDie(), b = rollDie(); return { dice: [a, b], total: a + b }; }

module.exports = {
  name: 'bjdice',
  description: 'Dice Blackjack — get to 21 without going over!',
  usage: '.bjdice <bet>',
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .bjdice <bet>`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `bjdice_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current BJ Dice game!')] });

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'BJ Dice', userId: message.author.id, bet });

    const playerRolls = [];
    let playerTotal = 0;
    const dealerRolls = [];
    let dealerTotal = 0;

    // Initial roll
    const pr = rollTwo();
    playerRolls.push(...pr.dice);
    playerTotal += pr.total;

    const dr = rollTwo();
    dealerRolls.push(dr.dice[0]); // Show only one die
    dealerTotal += dr.total;

    const buildEmbed = (finished = false, status = '') => new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🎲 Dice Blackjack')
      .addFields(
        { name: `🎲 Your Dice (${playerTotal})`, value: playerRolls.map(d => `[${d}]`).join(' '), inline: false },
        { name: `🤖 Dealer Dice (${finished ? dealerTotal : '?'})`, value: finished ? dealerRolls.map(d => `[${d}]`).join(' ') : `[${dealerRolls[0]}] [?]`, inline: false },
      )
      .setDescription(status || (playerTotal > 21 ? '💥 Bust!' : ''))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bjd_hit').setLabel('🎲 Roll').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bjd_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Secondary),
    );

    if (playerTotal === 21) {
      // Instant win check
      while (dealerTotal < 17) { const r = rollDie(); dealerRolls.push(r); dealerTotal += r; }
      return finalize(message, null, null, playerTotal, dealerTotal, bet, gameKey, client);
    }

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button, filter: i => i.user.id === message.author.id, time: 60000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'bjd_hit') {
        const d = rollDie();
        playerRolls.push(d);
        playerTotal += d;
        if (playerTotal >= 21) {
          collector.stop();
          await i.deferUpdate();
          while (dealerTotal < 17) { const r = rollDie(); dealerRolls.push(r); dealerTotal += r; }
          await finalize(message, reply, null, playerTotal, dealerTotal, bet, gameKey, client, buildEmbed);
        } else {
          await i.update({ embeds: [buildEmbed()], components: [row] });
        }
      } else {
        collector.stop();
        await i.deferUpdate();
        while (dealerTotal < 17) { const r = rollDie(); dealerRolls.push(r); dealerTotal += r; }
        await finalize(message, reply, null, playerTotal, dealerTotal, bet, gameKey, client, buildEmbed);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') { addBalance(message.author.id, bet); client.activeGames.delete(gameKey); reply.edit({ components: [] }).catch(() => {}); }
    });

    async function finalize(msg, rep, i, pTotal, dTotal, bet, key, cl, buildFn) {
      cl.activeGames.delete(key);
      let result, winnings = 0;
      if (pTotal > 21) result = 'bust';
      else if (dTotal > 21 || pTotal > dTotal) { result = 'win'; winnings = bet; addBalance(msg.author.id, bet * 2); }
      else if (pTotal === dTotal) { result = 'push'; addBalance(msg.author.id, bet); }
      else result = 'lose';

      recordGame(msg.author.id, result === 'win', winnings);
      const newBal = getUser(msg.author.id).balance;

      const statusMap = {
        win: `🎉 You win! +**${winnings.toLocaleString()}** ${config.currency}!`,
        bust: `💥 Bust! Lost **${bet.toLocaleString()}** ${config.currency}.`,
        push: `🤝 Push! Bet returned.`,
        lose: `😢 Dealer wins. Lost **${bet.toLocaleString()}** ${config.currency}.`,
      };

      const embed = new EmbedBuilder()
        .setColor(result === 'win' ? config.colors.success : result === 'push' ? config.colors.warning : config.colors.error)
        .setTitle('🎲 BJ Dice Result')
        .addFields(
          { name: `Your Dice (${pTotal})`, value: playerRolls.map(d => `[${d}]`).join(' '), inline: false },
          { name: `Dealer Dice (${dTotal})`, value: dealerRolls.map(d => `[${d}]`).join(' '), inline: false },
        )
        .setDescription([statusMap[result], `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`].join('\n'))
        .setTimestamp();

      if (rep) rep.edit({ embeds: [embed], components: [] }).catch(() => {});
      else msg.reply({ embeds: [embed] }).catch(() => {});
    }
  },
};
