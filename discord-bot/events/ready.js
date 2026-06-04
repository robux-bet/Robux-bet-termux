const { ActivityType } = require('discord.js');
const { registerSlashCommands } = require('../handlers/slashHandler');
const config = require('../config');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);

    client.user.setPresence({
      activities: [{ name: `best roblox casino (discord.gg/${config.serverInvite})`, type: ActivityType.Playing }],
      status: 'online',
    });

    await registerSlashCommands(client);
  },
};
