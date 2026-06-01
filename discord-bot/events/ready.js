const { ActivityType } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);

    client.user.setPresence({
      activities: [{ name: `best robux gambling server (discord.gg/${config.serverInvite})`, type: ActivityType.Playing }],
      status: 'online',
    });
  },
};
