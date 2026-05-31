const { getSeed, setSeed } = require('../../utils/database');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { hashServerSeed, generateServerSeedForUser } = require('../../utils/provableFair');
const crypto = require('crypto');

module.exports = {
  name: 'seed',
  description: 'View or change your provably fair client seed',
  usage: '.seed [newseed]',
  async execute(message, args) {
    const userId = message.author.id;
    const currentSeed = getSeed(userId);

    if (!args[0]) {
      const serverSeedHash = hashServerSeed(generateServerSeedForUser());
      return message.reply({
        embeds: [
          infoEmbed('🔐 Provably Fair Seed', [
            `**Your Client Seed:**\n\`${currentSeed}\``,
            '',
            'To change your seed, run `.seed <newseed>`',
            'Changing your seed resets your nonce to 0.',
          ].join('\n')),
        ],
      });
    }

    const newSeed = args[0].slice(0, 64);
    if (newSeed.length < 3) {
      return message.reply({ embeds: [errorEmbed('Invalid Seed', 'Seed must be at least 3 characters long.')] });
    }

    setSeed(userId, newSeed);
    message.reply({
      embeds: [successEmbed('Seed Updated', `Your client seed has been changed to:\n\`${newSeed}\`\n\nYour nonce has been reset to **0**`)],
    });
  },
};
