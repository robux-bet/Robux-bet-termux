const { ActivityType } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);

    const activities = [
      { name: `${config.prefix}help | Gambling Bot`, type: ActivityType.Playing },
      { name: `💎 Virtual Robux Casino`, type: ActivityType.Watching },
      { name: `${config.prefix}daily for free Robux`, type: ActivityType.Listening },
    ];

    let i = 0;
    client.user.setPresence({ activities: [activities[0]], status: 'online' });
    setInterval(() => {
      i = (i + 1) % activities.length;
      client.user.setPresence({ activities: [activities[i]], status: 'online' });
    }, 15000);
  },
};
