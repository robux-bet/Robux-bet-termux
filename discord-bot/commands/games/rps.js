const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const CHOICES = { r: { label: '✊ Rock', beats: 's' }, p: { label: '🖐 Paper', beats: 'r' }, s: { label: '✌️ Scissors', beats: 'p' } };
// AI uses weighted strategy — biased against common human patterns
const AI_WEIGHTS = { r: 34, p: 33, s: 33 };

function aiChoice() {
  const total = Object.values(AI_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(AI_WEIGHTS)) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'p';
}

function determineWinner(p, ai) {
  if (p === ai) return 'draw';
  if (CHOICES[p].beats === ai) return 'player';
  return 'ai';
}

module.exports = {
  name: 'rps',
  aliases: ['rockpaperscissors'],
  description: 'Rock Paper Scissors vs AI or another player',
  usage: '.rps <bet> [r|p|s] [@user]',
  guildOnly: true,
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .rps <bet> [r|p|s] [@user]`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const opponent = message.mentions.users.first();
    const vsPlayer = opponent && !opponent.bot && opponent.id !== message.author.id;

    if (vsPlayer) {
      // Multiplayer RPS
      const oppData = getUser(opponent.id);
      if (oppData.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough.`)] });

      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('✊ Rock Paper Scissors').setDescription(`${message.author} challenged ${opponent} to RPS!\nBet: **${bet.toLocaleString()}** ${config.currency} each\n\nBoth players, DM me your choice or click the button below!`).setTimestamp();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_r').setLabel('✊ Rock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_p').setLabel('🖐 Paper').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_s').setLabel('✌️ Scissors').setStyle(ButtonStyle.Danger),
      );
      const reply = await message.reply({ embeds: [embed], components: [row] });
      const picks = {};

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => [message.author.id, opponent.id].includes(i.user.id) && !picks[i.user.id],
        time: 60000,
      });

      collector.on('collect', async i => {
        picks[i.user.id] = i.customId.replace('rps_', '');
        await i.reply({ content: `✅ You picked **${CHOICES[picks[i.user.id]].label}**! Waiting for opponent...`, ephemeral: true });

        if (Object.keys(picks).length === 2) {
          collector.stop('done');
          const p1 = picks[message.author.id], p2 = picks[opponent.id];
          let desc, color;
          const result = determineWinner(p1, p2);
          if (result === 'draw') {
            addBalance(message.author.id, bet); addBalance(opponent.id, bet);
            desc = `🤝 **Draw!** ${CHOICES[p1].label} vs ${CHOICES[p2].label}. Bets returned.`;
            color = config.colors.warning;
          } else {
            const winner = result === 'player' ? message.author : opponent;
            const loser = result === 'player' ? opponent : message.author;
            removeBalance(loser.id, bet); removeBalance(winner.id, -bet);
            addBalance(winner.id, bet * 2);
            desc = `🏆 **${winner.username} wins!** ${CHOICES[p1].label} vs ${CHOICES[p2].label}\n+**${bet.toLocaleString()}** ${config.currency}!`;
            color = config.colors.success;
          }
          const resultEmbed = new EmbedBuilder().setColor(color).setTitle('✊ RPS Result').setDescription(desc).setTimestamp();
          reply.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});
        }
      });

      collector.on('end', (_, reason) => {
        if (reason !== 'done') {
          if (!picks[message.author.id]) addBalance(message.author.id, bet);
          if (!picks[opponent.id]) addBalance(opponent.id, bet);
          reply.edit({ content: '⏰ Game timed out.', components: [] }).catch(() => {});
        }
      });

      removeBalance(message.author.id, bet);
      removeBalance(opponent.id, bet);
      return;
    }

    // VS AI
    let playerChoice = ['r', 'p', 's'].includes(args[1]) ? args[1] : null;

    if (!playerChoice) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_r').setLabel('✊ Rock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_p').setLabel('🖐 Paper').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_s').setLabel('✌️ Scissors').setStyle(ButtonStyle.Danger),
      );
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('✊ RPS vs AI').setDescription(`Bet: **${bet.toLocaleString()}** ${config.currency}\nMake your pick!`).setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row] });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30000,
        max: 1,
      });

      collector.on('collect', async i => {
        playerChoice = i.customId.replace('rps_', '');
        await i.deferUpdate();
        await resolveVsAI(message, reply, bet, playerChoice);
      });
      collector.on('end', (_, reason) => { if (reason === 'time') reply.edit({ components: [] }).catch(() => {}); });
      return;
    }

    removeBalance(message.author.id, bet);
    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle('✊ RPS vs AI').setTimestamp()] });
    await resolveVsAI(message, reply, bet, playerChoice);
  },
};

async function resolveVsAI(message, reply, bet, playerChoice) {
  const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
  const config = require('../../config');

  removeBalance(message.author.id, bet);
  await new Promise(r => setTimeout(r, 800));

  const ai = ['r','p','s'][Math.floor(Math.random() * 3)];
  const result = CHOICES[playerChoice].beats === ai ? 'win' : playerChoice === ai ? 'draw' : 'lose';

  let desc, color;
  if (result === 'win') {
    addBalance(message.author.id, bet * 2);
    recordGame(message.author.id, true, bet);
    desc = `🎉 **You Win!** ${CHOICES[playerChoice].label} beats ${CHOICES[ai].label}!\n+**${bet.toLocaleString()}** ${config.currency}`;
    color = config.colors.success;
  } else if (result === 'draw') {
    addBalance(message.author.id, bet);
    desc = `🤝 **Draw!** Both picked ${CHOICES[playerChoice].label}. Bet returned.`;
    color = config.colors.warning;
  } else {
    recordGame(message.author.id, false, bet);
    desc = `😢 **AI Wins!** ${CHOICES[ai].label} beats ${CHOICES[playerChoice].label}.\n-**${bet.toLocaleString()}** ${config.currency}`;
    color = config.colors.error;
  }

  const newBal = getUser(message.author.id).balance;
  const embed = new EmbedBuilder().setColor(color).setTitle('✊ RPS vs AI')
    .setDescription([desc, `💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`].join('\n')).setTimestamp();
  reply.edit({ embeds: [embed], components: [] }).catch(() => {});
}
