const { EmbedBuilder } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const DICE_EMOJI = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
const HIGH = [4, 5, 6];
const LOW = [1, 2, 3];
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

module.exports = {
  name: 'dice',
  description: 'Roll a dice — High (4-6) or Low (1-3)',
  usage: '.dice <bet|all|half> <high|low>',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const target = args[1]?.toLowerCase();
    if (!target || !['high', 'low'].includes(target)) {
      return message.reply({ embeds: [errorEmbed('Invalid Target', 'Pick `high` (4–6) or `low` (1–3).\n`Usage: .dice <bet> <high|low>`')] });
    }

    const defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);
    const _u = getUser(message.author.id);
    const { mode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Dice', null, null, {
      bet, mult: '2x', payout: parseFloat((bet * 2).toFixed(2)),
      balance: isDemo ? _u.demoBalance : _u.balance, isDemo,
    });

    const game = beginGame(message.author.id, 1);
    spendBet(message.author.id, bet, isDemo);

    let roll;
    if (isForceWin(mode)) {
      roll = target === 'high' ? pick(HIGH) : pick(LOW);
    } else {
      // Lose: pick from the opposite side
      roll = target === 'high' ? pick(LOW) : pick(HIGH);
    }

    const won = (target === 'high' && roll >= 4) || (target === 'low' && roll <= 3);
    const mult = 2;
    const winnings = won ? calcPayout(bet, mult) : 0;
    if (won) addWin(message.author.id, winnings, isDemo);
    recordGame(message.author.id, won, won ? winnings - bet : bet);
    recordRiggedGame(message.author.id, isDemo, mode);
    const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

    saveGameRecord({
      gameId: game.gameId, type: 'dice', userId: message.author.id,
      serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
      clientSeed: game.clientSeed, nonce: game.nonce,
      inputs: { target },
      outcome: { roll, result: won ? 'win' : 'lose' },
    });

    const label = target === 'high' ? 'High (4–6)' : 'Low (1–3)';
    const embed = new EmbedBuilder()
      .setColor(won ? config.colors.success : config.colors.error)
      .setTitle(`🎲 Dice Roll${balLabel(isDemo)}`)
      .setDescription([
        `You rolled: **${DICE_EMOJI[roll]} ${roll}**`,
        `Your bet: **${label}** (2x)`,
        '',
        won ? `🎉 Won **${fmtR(winnings)}** ${config.currency}!` : `😢 Lost **${fmtR(bet)}** ${config.currency}.`,
        `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
      ].join('\n'))
      .setFooter({ text: gameIdFooter(game.gameId) })
      .setTimestamp();

    loadMsg.edit({ embeds: [embed] }).catch(() => {});
  },
};
