const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const config = require('../../config');

const BOT_NAMES = ['Shadow', 'Blaze', 'Phantom', 'Titan', 'Vortex'];
const TAUNTS = ["Is that all?", "Try harder!", "I'm barely sweating!", "You call that an attack?"];

module.exports = {
  name: 'fight',
  description: 'Turn-based fight vs another user or the Bot',
  usage: '.fight <bet|all|half> [@user]',
  guildOnly: true,
  async execute(message, args, client) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const gameKey = `fight_${message.author.id}`;
    if (client.activeGames.has(gameKey)) return message.reply({ embeds: [errorEmbed('Game Active', 'Finish your current fight!')] });

    const opponent = message.mentions.users.first();
    const vsBot = !opponent || opponent.bot || opponent.id === message.author.id;

    if (!vsBot) {
      const oppPool = require('../../utils/gameUtils').parseBet(opponent.id, String(bet));
      if (oppPool.error || oppPool.bet < bet) {
        return message.reply({ embeds: [errorEmbed('Insufficient Funds', `${opponent.username} doesn't have enough ${config.currency}.`)] });
      }
    }

    const mode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    spendBet(message.author.id, bet, isDemo);
    if (!vsBot) {
      const oppIsDemo = require('../../utils/database').getActivePool(opponent.id).isDemo;
      require('../../utils/database').spendBet(opponent.id, bet, oppIsDemo);
    }
    client.activeGames.set(gameKey, { name: 'Fight', userId: message.author.id, bet });

    const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const p1 = { name: message.author.username, hp: 100, maxHp: 100, userId: message.author.id };
    const p2 = vsBot
      ? { name: botName, hp: 100, maxHp: 100, isBot: true }
      : { name: opponent.username, hp: 100, maxHp: 100, userId: opponent.id };

    // In actual: bot goes first. In demo: player goes first.
    let turn = isDemo ? 1 : 2;
    let gameOver = false;
    const log = [];

    const hpBar = (cur, max) => {
      const f = Math.floor(Math.max(0, cur / max) * 10);
      return `[${'█'.repeat(f)}${'░'.repeat(10 - f)}] ${Math.max(0, cur)}/${max}`;
    };

    const buildEmbed = () => new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`⚔️ Fight!${balLabel(isDemo)}`)
      .addFields(
        { name: `❤️ ${p1.name}`, value: hpBar(p1.hp, p1.maxHp), inline: false },
        { name: `💜 ${p2.name}`, value: hpBar(p2.hp, p2.maxHp), inline: false },
        { name: '📜 Log', value: log.slice(-4).join('\n') || '— Fight Start! —', inline: false },
      )
      .setFooter({ text: turn === 1 ? `${p1.name}'s turn` : `${p2.name}'s turn` })
      .setTimestamp();

    // Only attack and heal (no heavy)
    const moveRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fight_attack').setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('fight_heal').setLabel('💊 Heal').setStyle(ButtonStyle.Success),
    );

    // Miss chances adjusted by rigged mode (only affects vs-bot fights)
    let playerMissChance, botMissChance;
    if (vsBot && isForceWin(mode)) { playerMissChance = 0.0; botMissChance = 1.0; }
    else if (vsBot && mode === 'lose') { playerMissChance = 1.0; botMissChance = 0.0; }
    else { playerMissChance = isDemo ? 0.05 : 0.50; botMissChance = isDemo ? 0.55 : 0.15; }

    function applyAttack(attacker, defender, isPlayerAttack) {
      const missChance = isPlayerAttack ? playerMissChance : botMissChance;
      if (Math.random() < missChance) {
        log.push(`💨 **${attacker.name}** missed!`);
        return;
      }
      const dmg = Math.floor(Math.random() * 20 + 15);
      defender.hp = Math.max(0, defender.hp - dmg);
      log.push(`⚔️ **${attacker.name}** hits **${defender.name}** for **${dmg}** dmg!`);
    }

    function applyHeal(healer) {
      const heal = Math.floor(Math.random() * 15 + 15);
      healer.hp = Math.min(healer.maxHp, healer.hp + heal);
      log.push(`💊 **${healer.name}** heals **${heal}** HP!`);
    }

    async function endGame(winnerName) {
      gameOver = true; client.activeGames.delete(gameKey);
      recordRiggedGame(message.author.id, isDemo, mode);
      let desc, color;
      if (winnerName === p1.name) {
        const payout = calcPayout(bet * 2, 1, false);
        addWin(p1.userId, payout, isDemo);
        recordGame(p1.userId, true, payout - bet);
        if (!vsBot && p2.userId) recordGame(p2.userId, false, bet);
        desc = `🏆 **${p1.name} wins!** +**${(payout - bet).toLocaleString()}** ${config.currency}!`;
        color = config.colors.success;
      } else {
        recordGame(p1.userId, false, bet);
        if (!vsBot && p2.userId) {
          const oppIsDemo = require('../../utils/database').isDemo(p2.userId);
          addWin(p2.userId, calcPayout(bet * 2, 1, false), oppIsDemo);
          recordGame(p2.userId, true, bet);
        }
        desc = `💀 **${p2.name} wins!** Lost **${bet.toLocaleString()}** ${config.currency}.`;
        color = config.colors.error;
      }
      const newBal = isDemo ? getUser(p1.userId).demoBalance : getUser(p1.userId).balance;
      const embed = new EmbedBuilder().setColor(color).setTitle('⚔️ Fight Over!')
        .addFields(
          { name: `❤️ ${p1.name}`, value: hpBar(p1.hp, p1.maxHp), inline: false },
          { name: `💜 ${p2.name}`, value: hpBar(p2.hp, p2.maxHp), inline: false },
        )
        .setDescription(`${desc}\n💰 Balance: **${newBal.toLocaleString()}** ${config.currency}${balLabel(isDemo)}`)
        .setTimestamp();
      reply.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    // If bot goes first (actual), do bot move immediately before showing buttons
    const reply = await message.reply({ embeds: [buildEmbed()], components: vsBot && !isDemo ? [] : [moveRow()] });

    async function doBotTurn() {
      const action = p2.hp < 30 && Math.random() < 0.6 ? 'heal' : 'attack';
      if (action === 'heal') applyHeal(p2);
      else applyAttack(p2, p1, false);
      if (Math.random() < 0.25) log.push(`💬 *${p2.name}: "${TAUNTS[Math.floor(Math.random() * TAUNTS.length)]}"*`);
      if (p1.hp <= 0) { return endGame(p2.name); }
      turn = 1;
      await reply.edit({ embeds: [buildEmbed()], components: [moveRow()] }).catch(() => {});
    }

    // Actual: bot starts first
    if (vsBot && !isDemo) {
      await new Promise(r => setTimeout(r, 1000));
      await doBotTurn();
      if (gameOver) return;
    }

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => {
        if (vsBot) return i.user.id === message.author.id && turn === 1;
        return (i.user.id === message.author.id && turn === 1) || (opponent && i.user.id === opponent.id && turn === 2);
      },
      time: 120000,
    });

    collector.on('collect', async i => {
      const moveKey = i.customId.replace('fight_', '');
      if (moveKey === 'attack') applyAttack(p1, p2, true);
      else applyHeal(p1);
      await i.deferUpdate();

      if (p2.hp <= 0) { collector.stop(); return endGame(p1.name); }
      turn = 2;

      if (vsBot) {
        await reply.edit({ embeds: [buildEmbed()], components: [] }).catch(() => {});
        await new Promise(r => setTimeout(r, 900));
        await doBotTurn();
        if (gameOver) collector.stop();
      } else {
        await reply.edit({ embeds: [buildEmbed()], components: [moveRow()] }).catch(() => {});
        // Flip turn back once opponent collects
      }
    });

    collector.on('end', (_, reason) => {
      client.activeGames.delete(gameKey);
      if (reason === 'time' && !gameOver) {
        addWin(p1.userId, bet, isDemo);
        if (!vsBot && p2.userId) {
          const { isDemo: isDemoFn2 } = require('../../utils/database');
          addWin(p2.userId, bet, isDemoFn2(p2.userId));
        }
        reply.edit({ content: '⏰ Fight timed out. Bets returned.', components: [] }).catch(() => {});
      }
    });
  },
};
