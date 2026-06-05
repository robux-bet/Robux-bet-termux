const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame, getActivePool, isDemo: isDemoFn } = require('../../utils/database');
const { parseBet, tiePayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const CHOICES = { r: '✊ Rock', p: '🖐 Paper', s: '✌️ Scissors' };
const BEATS = { r: 's', p: 'r', s: 'p' };

module.exports = {
  name: 'rps',
  aliases: ['rockpaperscissors'],
  description: 'Rock Paper Scissors — PvP only!',
  usage: '.rps <bet|all|half> @user',
  guildOnly: true,
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.reply({ embeds: [errorEmbed('PvP Only', 'Rock Paper Scissors can only be played against another user!\n`Usage: .rps <bet> @user`')] });
    }

    const oppPool = getActivePool(opponent.id);
    if (oppPool.amount < bet) {
      return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough ${config.currency}.`)] });
    }

    const oppIsDemo = oppPool.isDemo;

    // Challenge embed
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rps_accept').setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rps_decline').setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
    );
    const challengeEmbed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('✊ Rock Paper Scissors Challenge')
      .setDescription([
        `${message.author} challenged ${opponent} to **RPS**!`,
        `Bet: **${fmtR(bet)}** ${config.currency} each`,
        `Pot: **${(bet * 2).toLocaleString()}** ${config.currency}`,
        ``,
        `${opponent.username}, click **Accept** to play!`,
      ].join('\n'))
      .setTimestamp();
    const challengeMsg = await message.reply({ embeds: [challengeEmbed], components: [row] });

    const acceptCollector = challengeMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === opponent.id,
      time: 30000, max: 1,
    });

    acceptCollector.on('collect', async i => {
      if (i.customId === 'rps_decline') {
        await i.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('RPS Declined').setDescription(`${opponent.username} declined the challenge.`).setTimestamp()], components: [] });
        return;
      }
      await i.deferUpdate();

      // Both players pick
      spendBet(message.author.id, bet, isDemo);
      spendBet(opponent.id, bet, oppIsDemo);

      const pickRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_r').setLabel('✊ Rock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_p').setLabel('🖐 Paper').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_s').setLabel('✌️ Scissors').setStyle(ButtonStyle.Danger),
      );
      const pickEmbed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('✊ RPS — Make Your Pick!')
        .setDescription(`Both players click a button! Your pick is private.\n⏰ 25 seconds to choose.`)
        .setTimestamp();
      await challengeMsg.edit({ embeds: [pickEmbed], components: [pickRow] });

      const picks = {};
      const pickCollector = challengeMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => [message.author.id, opponent.id].includes(i.user.id) && !picks[i.user.id],
        time: 25000,
      });

      pickCollector.on('collect', async i => {
        picks[i.user.id] = i.customId.replace('rps_', '');
        await i.reply({ content: `✅ You chose **${CHOICES[picks[i.user.id]]}**! Waiting for opponent...`, ephemeral: true });

        if (Object.keys(picks).length === 2) {
          pickCollector.stop('done');
        }
      });

      pickCollector.on('end', async (_, reason) => {
        if (reason !== 'done') {
          // Someone didn't pick — return bets
          addWin(message.author.id, bet, isDemo);
          addWin(opponent.id, bet, oppIsDemo);
          await challengeMsg.edit({ content: '⏰ Time ran out. Bets returned.', components: [] }).catch(() => {});
          return;
        }

        const p1Choice = picks[message.author.id];
        const p2Choice = picks[opponent.id];
        const pot = bet * 2;
        let desc, color, winnerId, winnerIsDemo;

        let resultLabel;
        if (p1Choice === p2Choice) {
          const push = tiePayout(bet);
          addWin(message.author.id, push, isDemo);
          addWin(opponent.id, push, oppIsDemo);
          desc = `🤝 **Draw!** ${CHOICES[p1Choice]} vs ${CHOICES[p2Choice]}\nEach player gets back **${fmtR(push)}** ${config.currency} (house took 4%).`;
          color = config.colors.warning;
          resultLabel = 'Draw';
        } else if (BEATS[p1Choice] === p2Choice) {
          addWin(message.author.id, pot, isDemo);
          recordGame(message.author.id, true, bet);
          recordGame(opponent.id, false, bet);
          desc = `🏆 **${message.author.username} wins!** ${CHOICES[p1Choice]} beats ${CHOICES[p2Choice]}\n+**${fmtR(bet)}** ${config.currency}!`;
          color = config.colors.success;
          resultLabel = `${message.author.username} wins`;
        } else {
          addWin(opponent.id, pot, oppIsDemo);
          recordGame(opponent.id, true, bet);
          recordGame(message.author.id, false, bet);
          desc = `🏆 **${opponent.username} wins!** ${CHOICES[p2Choice]} beats ${CHOICES[p1Choice]}\n+**${fmtR(bet)}** ${config.currency}!`;
          color = config.colors.success;
          resultLabel = `${opponent.username} wins`;
        }

        const embed = new EmbedBuilder().setColor(color).setTitle('✊ RPS Result')
          .setDescription(desc).setTimestamp();
        await challengeMsg.edit({ embeds: [embed], components: [] }).catch(() => {});

        // Notify control channel with both picks
        if (config.controlChannelId) {
          const cc = await message.client.channels.fetch(config.controlChannelId).catch(() => null);
          if (cc) cc.send({
            embeds: [new EmbedBuilder()
              .setColor(color)
              .setTitle('✊ RPS Picks')
              .setDescription([
                `**${message.author.tag}:** ${CHOICES[p1Choice]}`,
                `**${opponent.tag}:** ${CHOICES[p2Choice]}`,
                `**Result:** ${resultLabel}`,
                `Bet: **${fmtR(bet)}** ${config.currency} each`,
              ].join('\n'))
              .setTimestamp()],
          }).catch(() => {});
        }
      });
    });

    acceptCollector.on('end', (_, reason) => {
      if (reason === 'time') challengeMsg.edit({ content: '⏰ Challenge expired.', components: [] }).catch(() => {});
    });
  },
};
