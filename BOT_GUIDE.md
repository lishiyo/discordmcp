# Discord LLM Bot Deployment Guide

This guide will walk you through deploying your Discord bot with LLM capabilities, ensuring it can respond to both DMs and @mentions in channels.

## Table of Contents
1. [Discord Bot Permissions Setup](#1-discord-bot-permissions-setup)
2. [Local Testing](#2-local-testing)
3. [Deployment Options](#3-deployment-options)
4. [Troubleshooting](#4-troubleshooting)

---

## 1. Discord Bot Permissions Setup

### Step 1: Update Bot Intents in Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application (the one with your bot)
3. Navigate to the **Bot** section in the left sidebar
4. Scroll down to **Privileged Gateway Intents**
5. Enable these intents:
   - ✅ **MESSAGE CONTENT INTENT** (REQUIRED for reading message content)
   - ✅ **SERVER MEMBERS INTENT** (optional, but useful)
   - ✅ **PRESENCE INTENT** (optional)

### Step 2: Generate Proper Invite Link

1. In the Developer Portal, go to **OAuth2** → **URL Generator**
2. Under **SCOPES**, select:
   - ✅ `bot`
   - ✅ `applications.commands` (if you plan to add slash commands later)

3. Under **BOT PERMISSIONS**, select these minimum requirements:
   - **Text Permissions:**
     - ✅ View Channels
     - ✅ Send Messages
     - ✅ Send Messages in Threads
     - ✅ Read Message History
     - ✅ Mention Everyone (for responding to mentions)
     - ✅ Add Reactions (optional, for acknowledgment)
     - ✅ Use External Emojis (optional)
     - ✅ Embed Links (if bot sends links)
   
   - **General Permissions:**
     - ✅ View Channels (under General)

4. Copy the generated URL at the bottom
5. Use this URL to re-invite your bot to ensure it has all permissions

### Step 3: Server-Side Channel Permissions

For each channel where you want the bot to respond:

1. Right-click the channel → **Edit Channel**
2. Go to **Permissions**
3. Add your bot (search for "MCP" or your bot's name)
4. Enable:
   - ✅ View Channel
   - ✅ Send Messages
   - ✅ Read Message History
   - ✅ Add Reactions

For private channels (like #aimibot-media):
- You MUST explicitly add the bot to each private channel
- The bot cannot see private channels unless specifically added

---

## 2. Local Testing

### Prerequisites Check

```bash
# Verify Node.js is installed
node --version  # Should be 16.x or higher

# Install dependencies
npm install

# Build the TypeScript
npm run build
```

### Environment Variables

Ensure your `.env` file contains:

```env
# Discord Bot Token
DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE

# OpenRouter API Configuration
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
LLM_MODEL=anthropic/claude-3.5-sonnet

# Optional: Alternative models
# LLM_MODEL=openai/gpt-4-turbo-preview
# LLM_MODEL=meta-llama/llama-3.1-70b-instruct
# LLM_MODEL=google/gemini-pro
```

### Running the Bot Locally

```bash
# Option 1: Standalone bot (simpler)
node build/discord-bot-with-llm.js

# Option 2: MCP Server + Bot (includes MCP tools)
node build/index-with-llm.js
```

### Testing Your Bot

1. **Test DMs:**
   - Open Discord
   - Find your bot in the member list
   - Click on it and send a direct message
   - Bot should respond

2. **Test Channel Mentions:**
   - In any channel where the bot has permissions
   - Type: `@MCP Hello, can you help me?`
   - Bot should respond with a reply

3. **Test Private Channels:**
   - Add bot to private channel (see Step 3 above)
   - Mention the bot: `@MCP test message`
   - Bot should respond

---

## 3. Deployment Options

### Option A: Deploy on a VPS (Recommended for Production)

#### Using a service like DigitalOcean, AWS EC2, or Linode:

1. **Set up the server:**
```bash
# SSH into your server
ssh user@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone your repository
git clone https://github.com/yourusername/discord-bot.git
cd discord-bot

# Install dependencies
npm install

# Build the project
npm run build
```

2. **Set up environment variables:**
```bash
# Create .env file
nano .env
# Add your DISCORD_TOKEN and OPENROUTER_API_KEY
```

3. **Use PM2 for process management:**
```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start build/discord-bot-with-llm.js --name "discord-bot"

# Save PM2 configuration
pm2 save

# Set up auto-restart on reboot
pm2 startup
```

### Option B: Deploy on Railway.app (Easy & Free Tier Available)

1. **Prepare your repository:**
   - Add a `start` script to package.json:
   ```json
   "scripts": {
     "start": "node build/discord-bot-with-llm.js",
     "build": "tsc"
   }
   ```

2. **Deploy on Railway:**
   - Go to [Railway.app](https://railway.app)
   - Connect your GitHub repository
   - Add environment variables in Railway dashboard
   - Deploy!

### Option C: Deploy on Render.com (Free Tier Available)

1. **Create a `render.yaml`:**
```yaml
services:
  - type: worker
    name: discord-bot
    env: node
    buildCommand: npm install && npm run build
    startCommand: node build/discord-bot-with-llm.js
    envVars:
      - key: DISCORD_TOKEN
        sync: false
      - key: OPENROUTER_API_KEY
        sync: false
      - key: LLM_MODEL
        value: anthropic/claude-3.5-sonnet
```

2. **Deploy:**
   - Push to GitHub
   - Connect repository to Render
   - Add environment variables
   - Deploy

### Option D: Keep Running Locally 24/7

For development/testing on your local machine:

```bash
# Using PM2 locally
npm install -g pm2
pm2 start build/discord-bot-with-llm.js --name discord-bot
pm2 save
```

---

## 4. Troubleshooting

### Common Issues and Solutions

#### Bot doesn't respond to messages
- **Check:** Bot has MESSAGE CONTENT INTENT enabled in Developer Portal
- **Check:** Bot has proper channel permissions
- **Check:** Bot is actually online (green dot in Discord)

#### "Missing Access" errors
- **Solution:** Bot needs to be added to private channels manually
- **Solution:** Re-invite bot with proper permissions using updated invite link

#### Bot responds slowly
- **Check:** OpenRouter API key has credits
- **Consider:** Using a faster model like `gpt-3.5-turbo` for testing

#### "Cannot send messages to this user" (DMs)
- **Check:** User has DMs enabled from server members
- **Check:** User hasn't blocked the bot

#### Bot crashes with "DISCORD_TOKEN not found"
- **Check:** `.env` file exists in project root
- **Check:** `.env` file is not committed to git (add to `.gitignore`)

### Monitoring Your Bot

#### Check bot status:
```bash
# If using PM2
pm2 status
pm2 logs discord-bot

# View real-time logs
pm2 logs discord-bot --lines 100
```

#### Monitor OpenRouter usage:
- Visit [OpenRouter Dashboard](https://openrouter.ai/dashboard)
- Check your credit balance and usage

### Security Best Practices

1. **Never commit `.env` file to git**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use environment-specific configs**
   - `.env.development` for local testing
   - `.env.production` for deployment

3. **Rotate tokens regularly**
   - Regenerate Discord bot token if compromised
   - Update OpenRouter API key periodically

4. **Rate limiting** (optional enhancement):
   ```javascript
   // Add to your bot code
   const rateLimits = new Map();
   const RATE_LIMIT = 5; // messages per minute
   ```

---

## Quick Command Reference

```bash
# Development
npm install              # Install dependencies
npm run build           # Compile TypeScript
node build/discord-bot-with-llm.js  # Run bot

# Production (with PM2)
pm2 start build/discord-bot-with-llm.js --name discord-bot
pm2 logs discord-bot    # View logs
pm2 restart discord-bot # Restart bot
pm2 stop discord-bot    # Stop bot

# Testing
npm test                # Run tests (if configured)
```

---

## Next Steps

Once your bot is running successfully:

1. **Add more features:**
   - Slash commands for specific functions
   - Different personalities per channel
   - Conversation memory/context
   - Image generation capabilities

2. **Improve performance:**
   - Add Redis for caching responses
   - Implement request queuing
   - Add database for conversation history

3. **Add moderation:**
   - Content filtering
   - Rate limiting per user
   - Admin-only commands

---

## Support

If you encounter issues:
1. Check the bot logs for error messages
2. Verify all permissions are correctly set
3. Ensure environment variables are properly configured
4. Check OpenRouter API status and credits

For the MCP server integration, you can also:
- Run the MCP server separately for Claude integration
- Use `build/index-with-llm.js` to combine both functionalities

---

Last updated: 2025-08-07