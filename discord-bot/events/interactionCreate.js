const { errorEmbed } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.slashCommands?.get(interaction.commandName);
    if (!cmd) return;

    // Admin-only check for all slash commands
    const isOwner = interaction.user.id === config.ownerId;
    const isAdmin = interaction.member?.permissions?.has('Administrator') ||
      config.adminRoleIds.some(id => interaction.member?.roles?.cache?.has(id));

    if (!isOwner && !isAdmin) {
      return interaction.reply({
        embeds: [errorEmbed('Access Denied', '🔒 This command is restricted to admins only.')],
        ephemeral: true,
      });
    }

    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(`❌ Slash /${interaction.commandName}:`, err);
      const reply = { embeds: [errorEmbed('Error', 'Something went wrong.')], ephemeral: true };
      if (interaction.replied || interaction.deferred) interaction.followUp(reply).catch(() => {});
      else interaction.reply(reply).catch(() => {});
    }
  },
};
