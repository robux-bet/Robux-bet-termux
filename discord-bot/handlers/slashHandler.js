const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

function loadSlashCommands(client) {
  client.slashCommands = new Map();
  const dir = path.join(__dirname, '../commands/slash');
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const cmd = require(path.join(dir, file));
    if (cmd.data && cmd.execute) {
      client.slashCommands.set(cmd.data.name, cmd);
    }
  }
  console.log(`✅ Loaded ${client.slashCommands.size} slash command(s)`);
}

async function registerSlashCommands(client) {
  const token   = process.env.TOKEN;
  const clientId = client.user.id;
  if (!token || !clientId) return;

  const commands = [...client.slashCommands.values()].map(c => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('🔄 Registering slash commands globally…');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Registered ${commands.length} slash command(s) globally`);
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err.message);
  }
}

module.exports = { loadSlashCommands, registerSlashCommands };
