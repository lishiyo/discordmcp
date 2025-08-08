# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord MCP (Model Context Protocol) server that enables LLMs to interact with Discord. The project provides multiple entry points for different use cases:
- **Basic MCP server** (`index.ts`): Core Discord MCP functionality for sending/reading messages
- **MCP + LLM bot** (`index-with-llm.ts`): Combines MCP tools with Discord bot that responds to mentions/DMs
- **Standalone LLM bot** (`discord-bot-with-llm.ts`): Discord bot with OpenRouter/OpenAI integration
- **MCP with extended tools** (`index-with-tools.ts`): MCP server with additional functionality (currently includes untracked file)

## Essential Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Development (watch mode)
npm run dev

# Run the basic MCP server
node build/index.js

# Run the MCP server with LLM bot
node build/index-with-llm.js

# Run standalone Discord LLM bot
node build/discord-bot-with-llm.js

# Test MCP server with inspector
npx @modelcontextprotocol/inspector node build/index.js
```

## Architecture

### Core Components

1. **MCP Server Layer** (`@modelcontextprotocol/sdk`)
   - Implements Model Context Protocol for Claude integration
   - Uses StdioServerTransport for communication
   - Provides tools: `list-servers`, `send-message`, `read-messages`

2. **Discord Integration** (`discord.js`)
   - Client with configurable intents (Guilds, GuildMessages, MessageContent, DirectMessages)
   - Partials support for DM handling (Channel, Message)
   - Helper functions for guild/channel resolution by name or ID

3. **LLM Integration** (Optional - in variants)
   - OpenRouter API integration (supports multiple models)
   - Alternative OpenAI API support
   - Configurable via environment variables

### Entry Points Comparison

- **index.ts**: Pure MCP server, no bot functionality
- **index-with-llm.ts**: Full integration - MCP tools + Discord bot with LLM
- **discord-bot-with-llm.ts**: Standalone bot without MCP, responds to mentions/DMs
- **index-with-tools.ts**: Extended MCP server (check for additional tools)

## Environment Configuration

Required `.env` variables:
```env
# Always required
DISCORD_TOKEN=your_discord_bot_token

# For LLM features (index-with-llm.ts, discord-bot-with-llm.ts)
OPENROUTER_API_KEY=sk-or-v1-your_key
LLM_MODEL=anthropic/claude-3.5-sonnet  # or other supported models

# Alternative to OpenRouter
OPENAI_API_KEY=your_openai_key  # If using OpenAI directly
```

## Discord Bot Setup Requirements

1. **Developer Portal Settings**:
   - Enable MESSAGE CONTENT INTENT (required)
   - Enable SERVER MEMBERS INTENT (recommended)
   
2. **Bot Permissions**:
   - View Channels
   - Send Messages
   - Read Message History
   - Mention Everyone (for responding to mentions)
   - Send Messages in Threads

3. **For Private Channels**: Must explicitly add bot to each private channel

## Key Implementation Patterns

### Error Handling
- Server/channel resolution provides clear error messages
- Distinguishes between "not found" and "multiple matches" scenarios
- Graceful fallback for single-server scenarios

### Channel/Guild Resolution
```typescript
// Attempts ID lookup first, then name search
// Returns specific errors for ambiguous matches
findGuild(identifier?: string)
findChannel(channelIdentifier: string, guildIdentifier?: string)
```

### Tool Input Validation
- Uses Zod schemas for parameter validation
- Provides detailed validation error messages
- Optional parameters have sensible defaults

## Deployment Notes

- PM2 recommended for production deployment (see BOT_GUIDE.md)
- Supports Railway, Render, and VPS deployments
- Build output goes to `build/` directory
- TypeScript compilation targets ES2022, Node16 module system

## Testing Approach

Currently no automated tests configured (`npm test` exits with error).
For testing:
1. Use MCP Inspector for MCP functionality
2. Test bot responses in Discord (DMs and channel mentions)
3. Verify permissions and intents are properly configured

## Database/Storage

- `chroma_db_store/` directory exists (ChromaDB for vector storage)
- Currently contains `chroma.sqlite3`
- Listed in `.gitignore` to avoid committing

## Common Issues & Solutions

1. **Bot not responding**: Check MESSAGE CONTENT INTENT is enabled
2. **"Missing Access" errors**: Add bot to private channels manually  
3. **Multiple server ambiguity**: Use `list-servers` tool first, then specify server ID
4. **Channel not found**: Ensure bot has View Channel permission