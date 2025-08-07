// ABOUTME: Enhanced MCP Discord server with integrated LLM chat capabilities
// ABOUTME: Combines MCP tools with Discord bot that responds to mentions/DMs

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from 'dotenv';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client, GatewayIntentBits, TextChannel, Message, Partials } from 'discord.js';
import { z } from 'zod';
import fetch from 'node-fetch';

dotenv.config();

// Discord client setup with additional intents for message handling
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel, // Required for DM channels
    Partials.Message, // Required for DM messages
  ],
});

// LLM Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'anthropic/claude-3.5-sonnet';

async function callLLM(prompt: string, context?: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: context || 'You are AIMI, a helpful AI companion in Discord.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  const data = await response.json() as any;
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${data.error?.message || 'Unknown error'}`);
  }
  
  return data.choices[0].message.content;
}

// Add ready event to confirm bot is online
client.once('ready', () => {
  console.error(`Discord bot logged in as ${client.user?.tag}`);
  console.error('Bot ID:', client.user?.id);
  console.error('Ready to respond to DMs and mentions!');
});

// Message handler for bot mentions and DMs
client.on('messageCreate', async (message: Message) => {
  console.error('Message received from:', message.author.tag, 'Content:', message.content.substring(0, 50));
  
  if (message.author.bot) {
    console.error('Ignoring bot message');
    return;
  }

  const botWasMentioned = message.mentions.has(client.user!.id);
  const isDM = message.channel.isDMBased();
  
  console.error('Bot mentioned:', botWasMentioned, 'Is DM:', isDM);

  if (!botWasMentioned && !isDM) return;

  // Show typing indicator (check if channel supports it)
  if ('sendTyping' in message.channel) {
    await message.channel.sendTyping();
  }

  try {
    const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();
    
    // Get context from recent messages
    const messages = await message.channel.messages.fetch({ limit: 5, before: message.id });
    const contextMessages = Array.from(messages.values())
      .reverse()
      .map(m => `${m.author.username}: ${m.content}`)
      .join('\n');

    const response = await callLLM(
      cleanContent,
      `You are AIMI, an AI companion in the "${message.guild?.name || 'DM'}" Discord server.
       Recent conversation:\n${contextMessages}\n
       Respond helpfully and concisely.`
    );

    await message.reply(response);
  } catch (error) {
    console.error('Error:', error);
    await message.reply('Sorry, I encountered an error. Please try again.');
  }
});

// Helper function to find a guild by name or ID
async function findGuild(guildIdentifier?: string) {
  if (!guildIdentifier) {
    if (client.guilds.cache.size === 1) {
      return client.guilds.cache.first()!;
    }
    throw new Error(`Bot is in ${client.guilds.cache.size} servers. Use 'list-servers' tool to see available servers, then specify server name or ID.`);
  }

  try {
    const guild = await client.guilds.fetch(guildIdentifier);
    if (guild) return guild;
  } catch {
    const guilds = client.guilds.cache.filter(
      g => g.name.toLowerCase() === guildIdentifier.toLowerCase()
    );
    
    if (guilds.size === 0) {
      throw new Error(`Server "${guildIdentifier}" not found. Use 'list-servers' tool to see available servers.`);
    }
    if (guilds.size > 1) {
      const guildList = guilds.map(g => `${g.name} (ID: ${g.id})`).join(', ');
      throw new Error(`Multiple servers found with name "${guildIdentifier}": ${guildList}. Please specify the server ID.`);
    }
    return guilds.first()!;
  }
  throw new Error(`Server "${guildIdentifier}" not found`);
}

// Helper function to find a channel by name or ID within a specific guild
async function findChannel(channelIdentifier: string, guildIdentifier?: string): Promise<TextChannel> {
  const guild = await findGuild(guildIdentifier);
  
  try {
    const channel = await client.channels.fetch(channelIdentifier);
    if (channel instanceof TextChannel && channel.guild.id === guild.id) {
      return channel;
    }
  } catch {
    const channels = guild.channels.cache.filter(
      (channel): channel is TextChannel =>
        channel instanceof TextChannel &&
        (channel.name.toLowerCase() === channelIdentifier.toLowerCase() ||
         channel.name.toLowerCase() === channelIdentifier.toLowerCase().replace('#', ''))
    );

    if (channels.size === 0) {
      throw new Error(`Channel "${channelIdentifier}" not found in server "${guild.name}". Use 'list-servers' tool to see available channels.`);
    }
    if (channels.size > 1) {
      const channelList = channels.map(c => `#${c.name} (${c.id})`).join(', ');
      throw new Error(`Multiple channels found with name "${channelIdentifier}" in server "${guild.name}": ${channelList}. Please specify the channel ID.`);
    }
    return channels.first()!;
  }
  throw new Error(`Channel "${channelIdentifier}" is not a text channel or not found in server "${guild.name}"`);
}

// Validation schemas
const SendMessageSchema = z.object({
  server: z.string().optional().describe('Server name or ID (optional if bot is only in one server)'),
  channel: z.string().describe('Channel name (e.g., "general") or ID'),
  message: z.string(),
});

const ReadMessagesSchema = z.object({
  server: z.string().optional().describe('Server name or ID (optional if bot is only in one server)'),
  channel: z.string().describe('Channel name (e.g., "general") or ID'),
  limit: z.number().min(1).max(100).default(50),
});

// Create MCP server instance
const server = new Server(
  {
    name: "discord-with-llm",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list-servers",
        description: "List all Discord servers the bot is connected to",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "send-message",
        description: "Send a message to a Discord channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description: 'Server name or ID (optional if bot is only in one server)',
            },
            channel: {
              type: "string",
              description: 'Channel name (e.g., "general") or ID',
            },
            message: {
              type: "string",
              description: "Message content to send",
            },
          },
          required: ["channel", "message"],
        },
      },
      {
        name: "read-messages",
        description: "Read recent messages from a Discord channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description: 'Server name or ID (optional if bot is only in one server)',
            },
            channel: {
              type: "string",
              description: 'Channel name (e.g., "general") or ID',
            },
            limit: {
              type: "number",
              description: "Number of messages to fetch (max 100)",
              default: 50,
            },
          },
          required: ["channel"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list-servers": {
        const servers = Array.from(client.guilds.cache.values()).map(guild => ({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          channels: guild.channels.cache
            .filter((c): c is TextChannel => c instanceof TextChannel)
            .map(c => ({
              id: c.id,
              name: c.name,
            }))
            .slice(0, 10),
        }));
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(servers, null, 2),
          }],
        };
      }

      case "send-message": {
        const { server, channel: channelIdentifier, message } = SendMessageSchema.parse(args);
        const channel = await findChannel(channelIdentifier, server);
        
        const sent = await channel.send(message);
        return {
          content: [{
            type: "text",
            text: `Message sent successfully to #${channel.name} in ${channel.guild.name}. Message ID: ${sent.id}`,
          }],
        };
      }

      case "read-messages": {
        const { server, channel: channelIdentifier, limit } = ReadMessagesSchema.parse(args);
        const channel = await findChannel(channelIdentifier, server);
        
        const messages = await channel.messages.fetch({ limit });
        const formattedMessages = Array.from(messages.values()).map(msg => ({
          channel: `#${channel.name}`,
          server: channel.guild.name,
          author: msg.author.tag,
          content: msg.content,
          timestamp: msg.createdAt.toISOString(),
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify(formattedMessages, null, 2),
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}:  ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// Enhanced main function
async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN environment variable is not set');
  }
  
  try {
    await client.login(token);
    console.error('Discord bot is ready with LLM capabilities!');
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Discord MCP Server with LLM running on stdio");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();