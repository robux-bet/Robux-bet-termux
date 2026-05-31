const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  client.commands = new Map();
  client.aliases = new Map();

  const categoriesPath = path.join(__dirname, '../commands');
  const categories = fs.readdirSync(categoriesPath);

  for (const category of categories) {
    const categoryPath = path.join(categoriesPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      command.category = category;
      client.commands.set(command.name, command);
      if (command.aliases) {
        for (const alias of command.aliases) {
          client.aliases.set(alias, command.name);
        }
      }
    }
  }

  console.log(`✅ Loaded ${client.commands.size} commands`);
}

module.exports = { loadCommands };
