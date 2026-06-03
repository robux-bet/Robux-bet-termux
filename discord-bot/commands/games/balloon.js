const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const config = require('../../config');

module.exports = {
  name: 'balloon',
  description: 'Pump the balloon — cash out before it pops!',
  usage: '.balloon <bet|all|half>',
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const gameKey = `balloon_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current balloon game!')] });

    const mode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    const game = beginGame(message.author.id, 1);
    spendBet(message.author.id, bet, isDemo);
    client.activeGames.set(gameKey, { name: 'Balloon', userId: message.author.id, bet });

    // Derive pop point from seed: 3-25 pumps (uniform)
    let popAt = Math.floor(game.floats[0] * 23) + 3;
    if (isForceWin(mode)) popAt = 9999; // never pops
    else if (mode === 'lose') popAt = 1; // pops on first pump

    let pumps = 0;
    let gameOver = false;
    const SIZES = ['—', '🎈', '🎈', '🎈🎈', '🎈🎈', '🎈🎈🎈', '💥'];
    const getMultiplier = () => parseFloat((1 + pumps * 0.15).toFixed(2));

    const buildEmbed = (status = '') => {
      const mult = getMultiplier();
      const size = SIZES[Math.min(pumps, SIZES.length - 1)];
      const bar = `[${'█'.repeat(Math.min(pumps, 20))}${'░'.repeat(Math.max(0, 20 - pumps))}]`;
      return new EmbedBuilder()
        .setColor(pumps > 12 ? config.colors.error : pumps > 6 ? config.colors.warning : config.colors.primary)
        .setTitle(`🎈 Balloon${balLabel(isDemo)}`)
        .setDescription([
          `${size} **${pumps} pumps**`,
          `${bar}`,
          `Multiplier: **${mult}x** | Cash out: **${calcPayout(bet, mult).toLocaleString()}** ${config.currency}`,
          status ? `\n${status}` : '',
        ].join('\n'))
        .setTimestamp();
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('balloon_pump').setLabel('💨 Pump').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('balloon_cash').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success),
    );

    const reply = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'balloon_cash') {
        if (pumps === 0) { await i.reply({ content: 'Pump at least once first!', ephemeral: true }); return; }
        const mult = getMultiplier();
        const winnings = calcPayout(bet, mult);
        addWin(message.author.id, winnings, isDemo);
        recordGame(message.author.id, true, winnings - bet);
        recordRiggedGame(message.author.id, isDemo, mode);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        gameOver = true; client.activeGames.delete(gameKey); collector.stop();

        saveGameRecord({
          gameId: game.gameId, type: 'balloon', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { pumps },
          outcome: { popAt, result: 'win' },
        });

        await i.update({
          embeds: [buildEmbed(`💰 Cashed at **${mult}x**! Won **${winnings.toLocaleString()}** ${config.currency}!\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`).setFooter({ text: gameIdFooter(game.gameId) })],
          components: [],
        }).catch(() => {});
        return;
      }

      pumps++;
      if (pumps >= popAt) {
        gameOver = true;
        recordGame(message.author.id, false, bet);
        recordRiggedGame(message.author.id, isDemo, mode);
        const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;
        client.activeGames.delete(gameKey); collector.stop();

        saveGameRecord({
          gameId: game.gameId, type: 'balloon', userId: message.author.id,
          serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed, nonce: game.nonce,
          inputs: { pumps },
          outcome: { popAt, result: 'lose' },
        });

        await i.update({
          embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('💥 POP!').setDescription([
            `The balloon popped after **${pumps}** pumps!`,
            `Lost **${bet.toLocaleString()}** ${config.currency}.`,
            `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`,
          ].join('\n')).setFooter({ text: gameIdFooter(game.gameId) }).setTimestamp()],
          components: [],
        }).catch(() => {});
      } else {
        await i.update({ embeds: [buildEmbed()], components: [row] }).catch(() => {});
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        if (pumps > 0) addWin(message.author.id, calcPayout(bet, getMultiplier()), isDemo);
        else addWin(message.author.id, bet, isDemo);
        reply.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
