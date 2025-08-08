# Discord MCP Server with LLM Bot

A unified Discord bot that combines Model Context Protocol (MCP) server capabilities with an interactive LLM-powered Discord bot. The bot responds to mentions and DMs while also providing MCP tools for Claude Desktop integration. Features recursive tool calling for complex multi-step operations.

## Features

### Discord Bot Features
- **Interactive LLM Bot**: Responds to @mentions and DMs
- **Recursive Tool Calling**: Handles multi-step Discord operations
- **Long Message Splitting**: Automatically splits responses over 2000 characters
- **Context Awareness**: Reads conversation history for better responses
- **Multi-Model Support**: Works with OpenRouter models (Claude, GPT, Llama, etc.)

### MCP Server Features
- Send messages to Discord channels
- Read recent messages from channels
- List all accessible servers and channels
- Automatic server and channel discovery
- Support for both channel names and IDs
- Proper error handling and validation

## Prerequisites

- Node.js 16.x or higher
- A Discord bot token
- An OpenRouter API key (for LLM functionality)
- The bot must be invited to your server with proper permissions:
  - Read Messages/View Channels
  - Send Messages
  - Read Message History
  - Message Content Intent (enabled in Discord Developer Portal)

## Setup

1. Clone this repository:
```bash
git clone https://github.com/yourusername/discordmcp.git
cd discordmcp
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```
DISCORD_TOKEN=your_discord_bot_token_here
OPENROUTER_API_KEY=sk-or-v1-your_key_here
LLM_MODEL=anthropic/claude-3.5-sonnet  # Optional, defaults to Claude
```

4. Build the server:
```bash
npm run build
```

## Running the Bot

### Start the Full-Featured Bot (Recommended)
```bash
npm start
# or
node build/index.js
```

This runs the main bot with:
- Discord bot that responds to mentions/DMs
- MCP server for Claude Desktop
- Recursive tool calling support
- LLM integration via OpenRouter

### MCP-Only Mode (No Discord Bot)
```bash
npm run start:mcp-only
# or
node build/index-mcp-only.js
```

This runs only the MCP server without the Discord bot features.

## Usage with Claude Desktop

1. Open your Claude for Desktop configuration file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the Discord MCP server configuration:
```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["path/to/discordmcp/build/index.js"],
      "env": {
        "DISCORD_TOKEN": "your_discord_bot_token_here"
      }
    }
  }
}
```

3. Restart Claude for Desktop

## Available Tools

### list-servers
Lists all Discord servers the bot has access to.

No parameters required.

Example response:
```json
[
  {
    "name": "My Server",
    "id": "123456789",
    "memberCount": 42,
    "channels": ["#general", "#random"]
  }
]
```

### send-message
Sends a message to a specified Discord channel.

Parameters:
- `server` (optional): Server name or ID (required if bot is in multiple servers)
- `channel`: Channel name (e.g., "general") or ID
- `message`: Message content to send

Example:
```json
{
  "channel": "general",
  "message": "Hello from MCP!"
}
```

### read-messages
Reads recent messages from a specified Discord channel.

Parameters:
- `server` (optional): Server name or ID (required if bot is in multiple servers)
- `channel`: Channel name (e.g., "general") or ID
- `limit` (optional): Number of messages to fetch (default: 50, max: 100)

Example:
```json
{
  "channel": "general",
  "limit": 10
}
```

## Discord Bot Usage

The bot responds to:
1. **@mentions in channels**: `@YourBot what's the weather?`
2. **Direct messages**: Just DM the bot directly
3. **Tool usage**: `@YourBot read the last 10 messages in #general`

### Supported LLM Models

Configure via `LLM_MODEL` environment variable:
- `anthropic/claude-3.5-sonnet` (default)
- `openai/gpt-4-turbo` 
- `openai/gpt-5-mini`
- `openai/gpt-oss-120b`
- `meta-llama/llama-3.1-70b-instruct`
- `google/gemini-pro`

## Development

1. Install development dependencies:
```bash
npm install --save-dev typescript @types/node
```

2. Start the server in development mode:
```bash
npm run dev
```

3. Project structure:
```
src/
├── index.ts           # Main bot with MCP + Discord bot + recursive tools
└── index-mcp-only.ts  # MCP server only (no Discord bot)
```

## Testing

You can test the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Examples

### Direct Bot Interactions (Discord)
1. **Simple chat**: `@YourBot tell me a joke`
2. **Read messages**: `@YourBot summarize the last 20 messages in #general`
3. **Cross-channel operations**: `@YourBot check #bugs and post a summary in #dev-team`
4. **Server listing**: `@YourBot list all channels you can see`

### MCP Tool Usage (Claude Desktop)
1. "Can you read the last 5 messages from the general channel?"
2. "Please send a message to the announcements channel saying 'Meeting starts in 10 minutes'"
3. "What were the most recent messages in the development channel about the latest release?"
4. "List all Discord servers the bot has access to"

The bot handles recursive operations automatically, so complex multi-step requests work seamlessly.

## Deployment

See [RENDER_DEPLOY.md](RENDER_DEPLOY.md) for detailed deployment instructions to Render.com.

Quick deploy with Render:
1. Push to GitHub
2. Connect repository to Render
3. Set environment variables
4. Deploy!

## Security Considerations

- The bot requires proper Discord permissions to function
- All message sending operations through MCP require explicit user approval
- Environment variables should be properly secured
- Tokens should never be committed to version control
- Channel access is limited to channels the bot has been given access to
- OpenRouter API key should be kept secure
- Enable only necessary Discord intents

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:
1. Check the GitHub Issues section
2. Consult the MCP documentation at https://modelcontextprotocol.io
3. Open a new issue with detailed reproduction steps