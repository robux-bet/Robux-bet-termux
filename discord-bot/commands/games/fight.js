const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getUser, removeBalance, addBalance, recordGame } = require('../../utils/database');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');

const MOVES = {
  attack: { emoji: '⚔️', label: 'Attack', dmgRange: [15, 35], cost: 0 },
  heavy:  { emoji: '🪓', label: 'Heavy', dmgRange: [25, 50], cost: 0, missChance: 0.35 },
  heal:   { emoji: '💊', label: 'Heal', healRange: [15, 30], cost: 0 },
};

const BOT_NAMES = ['Shadow', 'Blaze', 'Vortex', 'Phantom', 'Titan'];
const TAUNTS = ['Is that all you got?', "You fight like a poodle!", 'Try harder!', 'I\'m barely breaking a sweat!'];

module.exports = {
  name: 'fight',
  description: 'Fight another user or the Bot — turn-based combat!',
  usage: '.fight <bet> [@user]',
  guildOnly: true,
  async execute(message, args, client) {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', '`Usage: .fight <bet> [@user]`')] });

    const user = getUser(message.author.id);
    if (user.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `You only have **${user.balance.toLocaleString()}** ${config.currency}`)] });

    const gameKey = `fight_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current fight!')] });

    const opponent = message.mentions.users.first();
    const vsBot = !opponent || opponent.bot || opponent.id === message.author.id;

    if (!vsBot) {
      const oppUser = getUser(opponent.id);
      if (oppUser.balance < bet) return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough ${config.currency}.`)] });
      removeBalance(opponent.id, bet);
    }

    removeBalance(message.author.id, bet);
    client.activeGames.set(gameKey, { name: 'Fight', userId: message.author.id, bet });

    const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const p1 = { name: message.author.username, hp: 100, maxHp: 100, userId: message.author.id };
    const p2 = vsBot ? { name: botName, hp: 100, maxHp: 100, isBot: true } : { name: opponent.username, hp: 100, maxHp: 100, userId: opponent.id };

    let turn = 1; // 1 = p1's turn, 2 = p2's turn
    let gameOver = false;
    const log = [];

    const hpBar = (current, max) => {
      const pct = Math.max(0, current / max);
      const filled = Math.floor(pct * 10);
      return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${current}/${max}`;
    };

    const buildEmbed = () => new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('⚔️ Fight!')
      .addFields(
        { name: `❤️ ${p1.name}`, value: hpBar(p1.hp, p1.maxHp), inline: false },
        { name: `💜 ${p2.name}`, value: hpBar(p2.hp, p2.maxHp), inline: false },
        { name: '📜 Battle Log', value: log.slice(-4).join('\n') || '— Fight Start! —', inline: false },
      )
      .setFooter({ text: turn === 1 ? `${p1.name}'s turn` : `${p2.name}'s turn` })
      .setTimestamp();

    const moveRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fight_attack').setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('fight_heavy').setLabel('🪓 Heavy').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('fight_heal').setLabel('💊 Heal').setStyle(ButtonStyle.Success),
    );

    const reply = await message.reply({ embeds: [buildEmbed()], components: moveRow() ? [moveRow()] : [] });

    function applyMove(attacker, defender, moveKey) {
      const move = MOVES[moveKey];
      if (moveKey === 'heal') {
        const heal = Math.floor(Math.random() * (move.healRange[1] - move.healRange[0]) + move.healRange[0]);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        log.push(`💊 **${attacker.name}** heals **${heal}** HP!`);
      } else {
        if (move.missChance && Math.random() < move.missChance) {
          log.push(`🌀 **${attacker.name}** missed!`);
          return;
        }
        const dmg = Math.floor(Math.random() * (move.dmgRange[1] - move.dmgRange[0]) + move.dmgRange[0]);
        defender.hp = Math.max(0, defender.hp - dmg);
        log.push(`${move.emoji} **${attacker.name}** ${moveKey === 'heavy' ? 'heavy attacks' : 'attacks'} **${defender.name}** for **${dmg}** dmg!`);
      }
    }

    function botMove() {
      // Bot strategy: heal if low, heavy if high HP, random otherwise
      if (p2.hp < 30) return 'heal';
      if (p1.hp > 50 && Math.random() < 0.4) return 'heavy';
      return Math.random() < 0.7 ? 'attack' : 'heavy';
    }

    async function endGame(winner) {
      gameOver = true;
      client.activeGames.delete(gameKey);
      let desc, color;
      if (winner === p1.name) {
        addBalance(p1.userId, bet * 2);
        recordGame(p1.userId, true, bet);
        if (!vsBot) recordGame(p2.userId, false, bet);
        desc = `🏆 **${p1.name} wins!** +**${bet.toLocaleString()}** ${config.currency}!`;
        color = config.colors.success;
      } else {
        recordGame(p1.userId, false, bet);
        if (!vsBot) { addBalance(p2.userId, bet * 2); recordGame(p2.userId, true, bet); }
        desc = `💀 **${p2.name} wins!** ${vsBot ? 'Bot wins!' : ''} Lost **${bet.toLocaleString()}** ${config.currency}.`;
        color = config.colors.error;
      }
      const newBal = getUser(message.author.id).balance;
      const embed = new EmbedBuilder().setColor(color).setTitle('⚔️ Fight Over!')
        .addFields(
          { name: `❤️ ${p1.name}`, value: hpBar(p1.hp, p1.maxHp), inline: false },
          { name: `💜 ${p2.name}`, value: hpBar(p2.hp, p2.maxHp), inline: false },
          { name: '📜 Result', value: desc, inline: false },
        )
        .setDescription(`💰 Balance: **${newBal.toLocaleString()}** ${config.currency}`)
        .setTimestamp();
      reply.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => {
        if (vsBot) return i.user.id === message.author.id && turn === 1;
        return (i.user.id === message.author.id && turn === 1) || (i.user.id === opponent.id && turn === 2);
      },
      time: 120000,
    });

    collector.on('collect', async i => {
      const moveKey = i.customId.replace('fight_', '');
      const attacker = turn === 1 ? p1 : p2;
      const defender = turn === 1 ? p2 : p1;

      applyMove(attacker, defender, moveKey);
      await i.deferUpdate();

      if (defender.hp <= 0) { collector.stop(); return endGame(attacker.name); }

      turn = turn === 1 ? 2 : 1;

      if (vsBot && turn === 2) {
        // Bot's turn
        await reply.edit({ embeds: [buildEmbed()], components: [] }).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
        const bMove = botMove();
        applyMove(p2, p1, bMove);
        if (Math.random() < 0.3) log.push(`💬 *${p2.name}: "${TAUNTS[Math.floor(Math.random() * TAUNTS.length)]}"*`);
        if (p1.hp <= 0) { return endGame(p2.name); }
        turn = 1;
        await reply.edit({ embeds: [buildEmbed()], components: [moveRow()] }).catch(() => {});
      } else {
        await reply.edit({ embeds: [buildEmbed()], components: [moveRow()] }).catch(() => {});
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        addBalance(p1.userId, bet);
        if (!vsBot && p2.userId) addBalance(p2.userId, bet);
        reply.edit({ content: '⏰ Fight timed out. Bets returned.', components: [] }).catch(() => {});
      }
    });
  },
};
