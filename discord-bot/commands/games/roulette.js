const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { spendBet, addWin, getUser, recordGame } = require('../../utils/database');
const { parseBet, calcPayout, balLabel, fmtR } = require('../../utils/gameUtils');
const { errorEmbed } = require('../../utils/embeds');
const { beginGame, saveGameRecord, gameIdFooter } = require('../../utils/fairness');
const { getRiggedMode, isForceWin, recordRiggedGame } = require('../../utils/outcome');
const { awaitAdminControl } = require('../../utils/adminControl');
const config = require('../../config');

const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
const EVENS = [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36];
const ODDS = [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function getColor(num) {
  if (num === 0) return '🟢';
  return RED.includes(num) ? '🔴' : '⚫';
}

function getBetType(bet) {
  const n = parseInt(bet);
  if (!isNaN(n) && n >= 0 && n <= 36) return { type: 'number', value: n };
  const map = { red:'red', black:'black', green:'green', '0':'green', even:'even', odd:'odd' };
  if (map[bet]) return { type: map[bet] };
  return null;
}

function getMult(betType) {
  switch (betType.type) {
    case 'number': return 10;
    case 'green':  return 5;
    default:       return 2;
  }
}

function winResult(betType) {
  switch (betType.type) {
    case 'red':    return pick(RED);
    case 'black':  return pick(BLACK);
    case 'green':  return 0;
    case 'even':   return pick(EVENS);
    case 'odd':    return pick(ODDS);
    default:       return randInt(1, 36);
  }
}

function loseResult(betType) {
  switch (betType.type) {
    case 'red':    return pick([...BLACK, 0]);
    case 'black':  return pick([...RED, 0]);
    case 'green':  return pick(RED);
    case 'even': { let r; do { r = randInt(1, 36); } while (r % 2 === 0); return r; }
    case 'odd':  { let r; do { r = randInt(1, 36); } while (r % 2 !== 0); return r; }
    case 'number': { let r; do { r = randInt(0, 36); } while (r === betType.value); return r; }
    default:       return randInt(0, 36);
  }
}

async function runRoulette(message, existingMsg, bet, betType, isDemo) {
  let defaultMode = getRiggedMode(message.author.id, isDemo, bet, message.member);

  // Number bets ALWAYS lose — override default mode
  if (betType.type === 'number') defaultMode = 'lose';

  const _u = getUser(message.author.id);
  const _m = getMult(betType);
  const { mode: rawMode, loadMsg } = await awaitAdminControl(message, defaultMode, 'Roulette', existingMsg, null, {
    bet, mult: `${_m}x`, payout: parseFloat((bet * _m).toFixed(2)),
    balance: isDemo ? _u.demoBalance : _u.balance, isDemo,
  });

  // Number bets cannot win regardless of admin override
  const mode = betType.type === 'number' ? 'lose' : rawMode;

  const game = beginGame(message.author.id, 1);
  spendBet(message.author.id, bet, isDemo);

  let result;
  if (isForceWin(mode)) {
    result = winResult(betType);
  } else {
    result = loseResult(betType);
  }

  let won = false;
  switch (betType.type) {
    case 'red':    won = RED.includes(result); break;
    case 'black':  won = BLACK.includes(result); break;
    case 'green':  won = result === 0; break;
    case 'even':   won = result !== 0 && result % 2 === 0; break;
    case 'odd':    won = result % 2 === 1; break;
    case 'number': won = false; break; // always lose
  }

  const mult = getMult(betType);
  const winnings = won ? calcPayout(bet, mult) : 0;
  if (won) addWin(message.author.id, winnings, isDemo);
  recordGame(message.author.id, won, won ? winnings - bet : bet);
  recordRiggedGame(message.author.id, isDemo, mode);
  const newBal = isDemo ? getUser(message.author.id).demoBalance : getUser(message.author.id).balance;

  const betLabel = betType.type === 'number' ? `#${betType.value}` : betType.type;

  saveGameRecord({
    gameId: game.gameId, type: 'roulette', userId: message.author.id,
    serverSeed: game.serverSeed, hashedServerSeed: game.hashedServerSeed,
    clientSeed: game.clientSeed, nonce: game.nonce,
    inputs: { betLabel },
    outcome: { number: result, result: won ? 'win' : 'lose' },
  });

  const embed = new EmbedBuilder()
    .setColor(won ? config.colors.success : config.colors.error)
    .setTitle(`🎡 Roulette${balLabel(isDemo)}`)
    .setDescription([
      `${getColor(result)} **${result}** — ${result === 0 ? 'Green' : RED.includes(result) ? 'Red' : 'Black'}`,
      `Your bet: **${betLabel}** (${mult}x)`,
      '',
      won ? `🎉 Won **${fmtR(winnings)}** ${config.currency}!` : `😢 Lost **${fmtR(bet)}** ${config.currency}.`,
      `💰 Balance: **${fmtR(newBal)}** ${config.currency}${balLabel(isDemo)}`,
    ].join('\n'))
    .setFooter({ text: gameIdFooter(game.gameId) })
    .setTimestamp();

  loadMsg.edit({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  name: 'roulette',
  aliases: ['rou'],
  description: 'Spin the roulette wheel',
  usage: '.roulette <bet|all|half> [red|black|even|odd|0-36]',
  async execute(message, args) {
    const parsed = parseBet(message.author.id, args[0]);
    if (parsed.error) return message.reply({ embeds: [errorEmbed('Error', parsed.error)] });
    const { bet, isDemo } = parsed;

    const betTarget = args[1]?.toLowerCase();

    if (!betTarget) {
      // Show 4 buttons: Red, Black, Odd, Even
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rou_red').setLabel('🔴 Red (2x)').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rou_black').setLabel('⚫ Black (2x)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rou_odd').setLabel('🔢 Odd (2x)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rou_even').setLabel('🔢 Even (2x)').setStyle(ButtonStyle.Primary),
      );
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`🎡 Roulette${balLabel(isDemo)}`)
        .setDescription(`Bet: **${fmtR(bet)}** ${config.currency}\nChoose your bet:`)
        .setTimestamp();
      const reply = await message.reply({ embeds: [embed], components: [row] });
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30000, max: 1,
      });
      collector.on('collect', async i => {
        const choice = i.customId.replace('rou_', '');
        await i.deferUpdate();
        await runRoulette(message, reply, bet, getBetType(choice), isDemo);
      });
      collector.on('end', (_, r) => { if (r === 'time') reply.edit({ components: [] }).catch(() => {}); });
      return;
    }

    const betType = getBetType(betTarget);
    if (!betType) {
      return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Choose: `red` `black` `even` `odd` or a number `0–36`')] });
    }

    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(`🎡 Roulette${balLabel(isDemo)}`).setTimestamp()] });
    await runRoulette(message, reply, bet, betType, isDemo);
  },
};
