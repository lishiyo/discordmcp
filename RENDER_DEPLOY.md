# Deploying Discord MCP Recursive Bot to Render

This guide walks you through deploying your `index-with-tools-recursive.ts` Discord bot to Render.com.

## Prerequisites

Before deploying, ensure you have:
1. A GitHub account with this repository
2. A Render.com account (free tier available)
3. Your Discord bot token
4. Your OpenRouter API key

## Step 1: Prepare Your Repository

First, ensure your code is compiled and committed:

```bash
# Build the TypeScript files
npm run build

# Verify the build file exists
ls -la build/index-with-tools-recursive.js

# Commit all changes
git add .
git commit -m "Add Render deployment configuration"
git push origin add-llm  # or your branch name
```

## Step 2: Create a Render Account

1. Go to [Render.com](https://render.com)
2. Sign up using your GitHub account (recommended) or email
3. Verify your email if needed

## Step 3: Connect Your GitHub Repository

1. In Render dashboard, click **"New +"** → **"Background Worker"**
2. Connect your GitHub account if not already connected
3. Select your `discordmcp` repository
4. Choose the branch you want to deploy (e.g., `add-llm` or `main`)

## Step 4: Configure Your Service

Render should automatically detect the `render.yaml` file. If not, configure manually:

### Service Settings:
- **Name**: `discord-mcp-recursive-bot` (or your preferred name)
- **Region**: Oregon (or closest to you)
- **Branch**: Your deployment branch
- **Runtime**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `node build/index-with-tools-recursive.js`

## Step 5: Set Environment Variables

In the Render dashboard, go to your service → **Environment** tab and add:

### Required Variables:
```
DISCORD_TOKEN = your_bot_token_here
OPENROUTER_API_KEY = sk-or-v1-your_key_here
```

### Optional Variables:
```
LLM_MODEL = anthropic/claude-3.5-sonnet
# Other model options:
# - openai/gpt-4-turbo-preview
# - meta-llama/llama-3.1-70b-instruct
# - google/gemini-pro
```

⚠️ **Security Note**: Never commit these values to your repository!

## Step 6: Deploy

1. Click **"Create Background Worker"** or **"Save Changes"**
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Build your TypeScript
   - Start your bot

## Step 7: Monitor Your Deployment

### Check Deployment Status:
1. Go to your service dashboard on Render
2. Click on **"Logs"** tab
3. Look for these success messages:
   ```
   Discord bot logged in as YourBot#1234
   Bot ID: 123456789
   Ready with recursive tool calling support!
   MCP Server running on stdio
   ```

### Common Log Messages:
- `Discord bot connected with recursive tool calling!` - Bot is ready
- `Message received from:` - Bot is processing messages
- `Executing tool:` - Bot is using Discord tools
- `FOLLOW-UP RESPONSE` - Bot is handling recursive tool calls

## Step 8: Test Your Bot

1. Open Discord
2. Find a server where your bot is present
3. Test with:
   - **@YourBot** mention in a channel
   - Direct message to the bot
   - Ask it to read messages: "@YourBot can you read the last 10 messages in #general?"

## Troubleshooting

### Bot Not Responding

1. **Check Logs**: Look for error messages in Render logs
2. **Verify Token**: Ensure DISCORD_TOKEN is correct
3. **Check Intents**: Verify MESSAGE CONTENT INTENT is enabled in Discord Developer Portal
4. **API Credits**: Ensure OpenRouter account has credits

### Build Failures

If build fails, check:
```bash
# Locally verify build works
npm install
npm run build
ls -la build/index-with-tools-recursive.js
```

### Environment Variable Issues

- Variables are case-sensitive
- Don't include quotes in Render's environment variable values
- Verify no trailing spaces in tokens

### Service Crashes

If service keeps restarting:
1. Check if `index-with-tools-recursive.ts` exists in src/
2. Verify the compiled `.js` file exists in build/
3. Check Node.js version compatibility (requires 16.x+)

## Updating Your Bot

When you make changes:

1. **Local Development**:
   ```bash
   npm run build
   git add .
   git commit -m "Update bot functionality"
   git push origin add-llm
   ```

2. **Automatic Deploy**: If `autoDeploy: true` in render.yaml, Render will automatically redeploy

3. **Manual Deploy**: Click "Manual Deploy" → "Deploy latest commit" in Render dashboard

## Performance Optimization

### Free Tier Limitations:
- Service may spin down after 15 minutes of inactivity
- First message after idle may be slower
- Limited to 750 hours/month

### Upgrade Options:
- **Starter Plus ($7/month)**: Always-on, no spin-down
- **Standard ($25/month)**: More resources, better performance

## Monitoring and Logs

### Real-time Logs:
```bash
# View logs in Render dashboard or use Render CLI
render logs discord-mcp-recursive-bot --tail
```

### Health Checks:
- Monitor in Render dashboard → Metrics
- Set up alerts for service failures

## Security Best Practices

1. **Never commit secrets**: Use environment variables only
2. **Rotate tokens regularly**: Update in Render dashboard
3. **Use least privileges**: Only grant necessary Discord permissions
4. **Monitor usage**: Check OpenRouter dashboard for unusual activity

## Additional Features

Your bot supports:
- **Recursive tool calling**: Handles multiple rounds of Discord operations
- **Long message splitting**: Automatically splits responses over 2000 chars
- **Context awareness**: Reads recent conversation history
- **Multiple server support**: Works across multiple Discord servers
- **DM support**: Responds to direct messages

## Support

If you encounter issues:
1. Check Render Status: https://status.render.com
2. Review logs in Render dashboard
3. Verify Discord bot permissions
4. Check OpenRouter API status and credits

## Cost Estimation

### Render Costs:
- **Free Tier**: $0/month (750 hours, may spin down)
- **Starter Plus**: $7/month (always-on)

### OpenRouter Costs:
- Varies by model usage
- Claude 3.5 Sonnet: ~$3 per million input tokens
- Monitor usage at https://openrouter.ai/dashboard

---

## Quick Reference Commands

```bash
# Build locally
npm run build

# Test locally before deploy
node build/index-with-tools-recursive.js

# Push to GitHub (triggers auto-deploy)
git push origin add-llm

# View specific start script
npm run start:recursive
```

Your bot is now deployed and ready to serve your Discord community with advanced LLM capabilities and recursive tool calling support!