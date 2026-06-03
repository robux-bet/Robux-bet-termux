require('dotenv').config();

module.exports = {
  token: process.env.TOKEN,
  prefix: process.env.PREFIX || '.',
  adminRoleId: process.env.ADMIN_ROLE_ID || '',
  adminRoleIds: (process.env.ADMIN_ROLE_ID || '').split(',').map(s => s.trim()).filter(Boolean),
  depositChannelId: process.env.DEPOSIT_CHANNEL_ID || '',
  withdrawChannelId: process.env.WITHDRAW_CHANNEL_ID || '',
  serverInvite: process.env.SERVER_INVITE || 'n7wWqamv6b',
  ownerId: process.env.OWNER_ID || '',
  currency: 'Robux',
  currencyEmoji: '💎',
  dailyMin: 1,
  dailyMax: 10,
  startingBalance: 100,
  colors: {
    primary: 0x5865F2,
    success: 0x57F287,
    error: 0xED4245,
    warning: 0xFEE75C,
    info: 0x5865F2,
    gold: 0xF1C40F,
  },
};
