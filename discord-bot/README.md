# 💎 Robux Discord Bot

A full-featured Discord gambling bot with virtual **Robux** currency, built with Discord.js v14.

---

## 📦 Setup on Termux

### 1. Install Node.js
```bash
pkg update && pkg upgrade
pkg install nodejs
node --version  # should be v18+
```

### 2. Copy & install bot
```bash
# Transfer the discord-bot folder to your Termux, then:
cd discord-bot
npm install
```

### 3. Create your .env file
```bash
cp .env.example .env
nano .env
```

Fill in:
```
TOKEN=your_bot_token_here
PREFIX=.
ADMIN_ROLE_ID=your_admin_role_id
```

### 4. Enable Privileged Intents
Go to [discord.com/developers/applications](https://discord.com/developers/applications):
- Select your bot → **Bot** tab
- Enable: **Server Members Intent** and **Message Content Intent**

### 5. Invite your bot
Use this URL (replace CLIENT_ID):
```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=397821785152&scope=bot
```

### 6. Start the bot
```bash
npm start
```

To keep it running in background on Termux:
```bash
npm start &
# or use:
nohup npm start &
```

---

## 🛡️ Admin Setup

1. Right-click your admin role → **Copy ID**
2. Paste it as `ADMIN_ROLE_ID` in your `.env` file

---

## 📁 File Structure

```
discord-bot/
├── index.js              ← Main entry point
├── config.js             ← Bot settings
├── .env                  ← Your secrets (never share this)
├── package.json
├── data/
│   └── users.json        ← All user data stored here
├── utils/
│   ├── database.js       ← JSON database functions
│   ├── provableFair.js   ← Seed-based RNG
│   └── embeds.js         ← Reusable Discord embeds
├── handlers/
│   └── commandHandler.js ← Auto-loads all commands
├── events/
│   ├── ready.js          ← Bot startup
│   └── messageCreate.js  ← Message handler
└── commands/
    ├── admin/            ← Admin-only commands
    ├── utilities/        ← Utility commands
    ├── balance/          ← Economy commands
    └── games/            ← All 21 game commands
```

---

## 🎮 All Commands

### 🛡️ Admin (requires Admin role or Administrator permission)
| Command | Description |
|---|---|
| `.add @user <amount>` | Add Robux to a user |
| `.remove @user <amount>` | Remove Robux from a user |
| `.setbalance @user <amount>` | Set a user's balance |
| `.adminvault @user <set\|add\|remove\|view> <amount>` | Manage vault |

### 🔧 Utilities
| Command | Description |
|---|---|
| `.help [category]` | Browse commands with buttons |
| `.ping` | Latency + uptime |
| `.games` | All active games |
| `.seed [newseed]` | View/change provably fair seed |
| `.room create\|add\|remove\|close` | Manage private threads |

### 💰 Balance
| Command | Description |
|---|---|
| `.balance / .bal [@user]` | Check wallet + vault |
| `.daily` | Spin wheel for 1–10 Robux (24h cooldown) |
| `.deposit / .depo <amount>` | Open a deposit ticket thread |
| `.withdraw <amount>` | Open a withdrawal ticket thread |
| `.tip @user <amount>` | Send Robux to another user |

### 🎮 Games
| Command | Description |
|---|---|
| `.slots <bet>` | 7-symbol slot machine |
| `.cf <bet> [h\|t]` | Coinflip vs house |
| `.dice <bet> <1-6\|high\|low>` | Dice roll |
| `.crash <bet>` | Multiplier crash game — cash out before crash! |
| `.bj <bet>` | Blackjack with Hit/Stand/Double |
| `.baccarat <bet> [p\|b\|t]` | Player / Banker / Tie |
| `.balloon <bet>` | Pump balloon, cash out before pop |
| `.hilo <bet>` | Higher or Lower card game |
| `.limbo <bet> <mult>` | Bet on a target multiplier |
| `.mines <bet> <mines>` | Minesweeper with cash-out |
| `.plinko <bet> [8\|12\|16]` | Plinko board drop |
| `.roulette <bet> <target>` | Roulette wheel (Red/Black/Number/etc.) |
| `.cards <bet> [color\|suit]` | Guess card color or suit |
| `.bjdice <bet>` | Dice Blackjack variant |
| `.casebattles <bet> [@user]` | Case opening battle |
| `.fight <bet> [@user]` | Turn-based fight vs AI or player |
| `.ghosts <bet>` | Pick 3 ghosts — avoid evil ones |
| `.rps <bet> [r\|p\|s] [@user]` | Rock Paper Scissors |
| `.ttt <bet> [@user]` | Tic Tac Toe (unbeatable AI or player) |
| `.connect <bet> [@user]` | Connect 4 vs hard AI or player |
| `.market [buy\|sell\|inventory]` | Virtual item shop |

---

## 💡 Tips

- All game data is saved to `data/users.json` — back it up!
- New users start with **100 Robux**
- Games with `@user` can be played vs AI (no mention) or another player (with mention)
- The TTT AI uses **minimax** — it is unbeatable
- Connect 4 AI uses **minimax with alpha-beta pruning** at depth 5 — very hard
