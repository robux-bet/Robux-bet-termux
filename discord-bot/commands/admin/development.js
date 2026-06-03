const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

const DEVMODE_PATH = path.join(__dirname, '../../data/devmode.json');

function getDevMode() {
  try { return JSON.parse(fs.readFileSync(DEVMODE_PATH, 'utf8')).enabled; } catch { return false; }
}
function setDevMode(val) {
  fs.writeFileSync(DEVMODE_PATH, JSON.stringify({ enabled: val }, null, 2));
}

module.exports = {
  name: 'development',
  aliases: ['dev', 'devmode'],
  description: 'Toggle development mode (blocks all commands for non-owners)',
  usage: '.development <on|off>',
  adminOnly: true,
  async execute(message, args) {
    if (message.author.id !== config.ownerId) {
      return message.reply('❌ Only the bot owner can toggle development mode.');
    }
    const input = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(input)) {
      const current = getDevMode();
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(current ? 0xED4245 : 0x57F287)
          .setDescription(`Dev mode is currently **${current ? 'ON 🔴' : 'OFF 🟢'}**.\nUse \`.development on\` or \`.development off\`.`)],
      });
    }
    const enabling = input === 'on';
    setDevMode(enabling);
    message.reply({
      embeds: [new EmbedBuilder()
        .setColor(enabling ? 0xED4245 : 0x57F287)
        .setTitle(enabling ? '🔴 Development Mode ON' : '🟢 Development Mode OFF')
        .setDescription(enabling
          ? 'All commands are **blocked** for everyone except the bot owner.'
          : 'Bot is back **online** — all commands are available.')
        .setTimestamp()],
    });
  },
  getDevMode,
};
